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
# Nothing is left half-done. If the apply does not succeed the values file is
# put back the way it was found, because a tfvars saying armed over an estate
# that is not is the state nobody can see.
#
# Usage:
#   scripts/arm-cwagent-alarms.sh --target staging
#   scripts/arm-cwagent-alarms.sh --target production --profile <p>
#
# Flags:
#   --target staging|production  Environment to arm (required, no default).
#   --profile <p>                AWS profile for the precondition check.
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
    --help|-h) usage; exit 2 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

case "$TARGET" in
  staging|production) ;;
  '') echo "ERROR: --target is required ('staging' or 'production')" >&2; exit 2 ;;
  *) echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TFVARS_PATH="${TFVARS_OVERRIDE:-${REPO_ROOT}/terraform/${TARGET}/terraform.tfvars}"

SYNTHETIC=0
if [[ -n "$TFVARS_OVERRIDE" ]]; then
  SYNTHETIC=1
  echo "SYNTHETIC: values file '${TFVARS_PATH}', stopping before terraform." >&2
fi

# The prompt below is the last gate before an operator's values file changes, so
# it must not be answerable by a redirected file. Synthetic runs are the CI path
# and drive the prompt from piped stdin by design.
if (( ! SYNTHETIC )) && ! { [[ -t 0 ]] && [[ -t 1 ]] && [[ -t 2 ]]; }; then
  echo "ERROR: arming needs an interactive terminal for its confirmation," >&2
  echo "       but stdin/stdout/stderr are not all TTYs." >&2
  echo "       Re-run from an interactive shell. Nothing has been changed." >&2
  exit 1
fi

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
ARMED_OK=0
restore_on_failure() {
  if (( ARMED_OK == 0 )) && [[ -s "$TFVARS_BACKUP" ]]; then
    cat "$TFVARS_BACKUP" > "$TFVARS_PATH"
    echo "" >&2
    echo "Put $TFVARS_PATH back the way it was found: the apply did not succeed," >&2
    echo "and a values file claiming armed over an estate that is not is exactly" >&2
    echo "the invisible half-state this script exists to prevent." >&2
  fi
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
printf "Apply this change to %s? (yes/no): " "$TFVARS_PATH"
read -r CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted: tfvars not changed." >&2
  exit 1
fi

# cat rather than mv: the values file is a symlink into the private operations
# checkout, and moving over it would replace the link with a real file in this
# tree, which is the one thing that must never exist here.
cat "$TFVARS_TMP" > "$TFVARS_PATH"
echo "  $TFVAR_NAME = true written."

if (( SYNTHETIC )); then
  ARMED_OK=1
  echo ""
  echo "-- synthetic mode: stopping before terraform --"
  exit 0
fi

echo ""
echo "== applying =="
bash "${SCRIPT_DIR}/terraform-apply.sh" --target "$TARGET"
ARMED_OK=1

echo ""
echo "== confirming the alarms exist =="
AWS_ARGS=(--region us-east-1)
[[ -n "$PROFILE" ]] && AWS_ARGS+=(--profile "$PROFILE")
aws cloudwatch describe-alarms \
  --alarm-name-prefix "footbag-${TARGET}-high" \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Missing:TreatMissingData}' \
  --output table "${AWS_ARGS[@]}"

echo ""
echo "They settle into OK once three evaluation periods of real data are in."
echo "One that stays at INSUFFICIENT_DATA is bound to something the host does"
echo "not publish, and the metric check names which combination is missing."

#!/usr/bin/env bash
# rehearse-planned-maintenance.sh
#
# The planned-maintenance rehearsal, as one command.
#
# WHAT IT PROVES.
#
# That the deliberate maintenance window actually works on the real
# distribution, before anyone needs it:
#
#   1. Every page path answers 503 carrying the branded page, not the storage
#      service's XML.
#   2. The page's own URL still answers 200 while the window is up, which is what
#      the custom-error routing resolves against.
#   3. Turning the flag off puts the site back.
#
# It is deliberately NOT the cutover lever. The cutover's migration notice lives
# in the distribution's viewer-request function and is served per hostname; this
# flag swaps the default cache behaviour's origin, which blanks every hostname
# the distribution answers on, preview included. The two are different acts with
# different blast radii and this script rehearses only the second.
#
# WHY IT IS A SCRIPT AND NOT A RUNBOOK.
#
# The sequence is flag on, apply, check, flag off, apply, check. Typed from
# memory it loses a step, and the step it loses is the last one, which leaves
# production serving a maintenance page to the public with nothing recording
# that it should not be. Nothing alarms on that state either: the CloudFront 5xx
# alarm counts the window's own deliberate 503s and cannot tell them from an
# outage. So the run owns its own reversal, and when it cannot finish it says so
# in terms an operator cannot miss.
#
# WHAT IT REFUSES.
#
#   - Any target but production. Staging has no maintenance-page resources at
#     all, by a recorded ruling: no origin, no ordered behaviour, no custom error
#     responses, and the flag does not exist in that tree. A staging run would be
#     rehearsing nothing. This refusal is the only thing a staging run can prove,
#     and it proves it without applying anything.
#   - A run where the page object is not in the bucket. The window would then
#     serve the storage service's 403 XML on every path, which is the exact
#     failure the maintenance page exists to prevent, and it is what production
#     did before the object became Terraform-managed. Checked by fetching, not by
#     asking.
#   - A run where the flag does not already read false. The script restores what
#     it changed and nothing else; a flag someone else set true may be true on
#     purpose.
#   - A run with no terminal. Each apply stops for a typed confirmation, and a
#     run that cannot be confirmed must refuse rather than proceed.
#
# WHAT IT NEVER DOES.
#
# Apply on the trap. An interrupted run restores the values file, because the run
# is what changed it, and then reports the live state and stops. Applying to
# production unattended is the thing the confirmation exists to prevent, and a
# trap is the least attended moment there is.
#
# Usage:
#   scripts/rehearse-planned-maintenance.sh --target production
#   scripts/rehearse-planned-maintenance.sh --target production --domain <host>
#   scripts/rehearse-planned-maintenance.sh --target staging     # refuses, by design
#
# Flags:
#   --target <env>   Required, no default. Only "production" runs.
#   --domain <host>  Hostname to verify against. Defaults to the distribution
#                    domain from terraform output, which is the right answer
#                    before the custom domain is live and after it.
#   --tfvars <path>  Synthetic mode: rewrite a local file, run the injected apply
#                    command, and never touch a real environment. The test path.
#   --yes            Accept the confirmations without a terminal. Refused in a
#                    real production run; synthetic mode only.
#
# Exits 0 when the whole cycle passed and the flag is back to false, 1 when any
# step failed, 2 on invalid invocation.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Sourced for confirm_from_tty. Sourced before the flag loop because the library
# assigns the accept-without-asking flag unconditionally, and a caller parsing
# its own flags first would have the answer overwritten.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TARGET=""
DOMAIN=""
TFVARS_OVERRIDE=""
SYNTHETIC=0

# The apply command lives in one place so the preview and the command actually
# run cannot drift apart. The injected form exists only so a test can assert the
# real argument list; it is never set in operator use, and on its own it is not a
# safety interlock. What keeps a test away from real infrastructure is synthetic
# mode, which --tfvars turns on.
APPLY_CMD="${FOOTBAG_MAINT_APPLY_CMD:-$REPO_ROOT/scripts/terraform-apply.sh}"
if [[ -n "${FOOTBAG_MAINT_APPLY_CMD:-}" ]]; then
  echo "SYNTHETIC: apply command='${APPLY_CMD}' -- not the real apply." >&2
  echo "           Pass --tfvars as well, or this run applies for real." >&2
fi

# Likewise for the fetch, so the verification can be driven without a network.
CURL_CMD="${FOOTBAG_MAINT_CURL_CMD:-curl}"
if [[ -n "${FOOTBAG_MAINT_CURL_CMD:-}" ]]; then
  echo "SYNTHETIC: fetch command='${CURL_CMD}' -- not reaching the real edge." >&2
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --domain)
      DOMAIN="${2:-}"
      shift 2 || { echo "ERROR: --domain requires an argument" >&2; exit 2; }
      ;;
    --tfvars)
      TFVARS_OVERRIDE="${2:-}"
      SYNTHETIC=1
      shift 2 || { echo "ERROR: --tfvars requires a path" >&2; exit 2; }
      ;;
    --yes) ASSUME_YES=yes; shift ;;
    -h|--help)
      sed -n '2,/^set -euo pipefail/{/^set -euo pipefail/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# ── Refusals that cost nothing to check ──────────────────────────────────────

if [[ -z "$TARGET" ]]; then
  echo "ERROR: name the environment with --target. There is no default." >&2
  exit 2
fi

if [[ "$TARGET" != "production" ]]; then
  echo "ERROR: --target $TARGET has no maintenance page to rehearse." >&2
  echo "       Only production carries the maintenance-page resources. Staging" >&2
  echo "       deliberately has none -- no S3 origin, no ordered behaviour, no" >&2
  echo "       custom error responses -- and the planned-maintenance variable is" >&2
  echo "       not declared in that tree at all, so there is nothing to flip." >&2
  echo "       A staging 5xx reaching the viewer as a 5xx is what a test" >&2
  echo "       environment should do. The reason is recorded in" >&2
  echo "       terraform/staging/cloudfront.tf where the resources would sit." >&2
  exit 2
fi

if [[ "$ASSUME_YES" == "yes" && "$SYNTHETIC" -eq 0 ]]; then
  echo "ERROR: --yes is refused for a real production run." >&2
  echo "       This run applies to production twice. Each apply stops for a" >&2
  echo "       typed confirmation and no flag supplies it in advance." >&2
  exit 2
fi

TF_DIR="terraform/${TARGET}"
TFVAR_NAME="enable_planned_maintenance"

# ── The values file ──────────────────────────────────────────────────────────

TFVARS_PATH="${TFVARS_OVERRIDE:-$TF_DIR/terraform.tfvars}"
if [[ ! -f "$TFVARS_PATH" ]]; then
  echo "ERROR: no values file at $TFVARS_PATH." >&2
  echo "       Each environment's terraform.tfvars is a symlink into the" >&2
  echo "       maintainers' private operations checkout. Without that checkout" >&2
  echo "       the link dangles and nothing here can be planned or applied." >&2
  exit 1
fi

read_flag() {
  awk -v name="$TFVAR_NAME" '
    $0 ~ "^[ \t]*" name "[ \t]*=" {
      line = $0
      sub(/^[^=]*=[ \t]*/, "", line)
      gsub(/[ \t"]/, "", line)
      sub(/#.*$/, "", line)
      print line
      exit
    }
  ' "$1"
}

CURRENT="$(read_flag "$TFVARS_PATH")"
if [[ -z "$CURRENT" ]]; then
  echo "ERROR: no $TFVAR_NAME assignment in $TFVARS_PATH." >&2
  echo "       Add one rather than letting this script invent the line." >&2
  exit 1
fi
if [[ "$CURRENT" != "false" ]]; then
  echo "ERROR: $TFVAR_NAME already reads \"$CURRENT\"." >&2
  echo "       This run restores what it changed and nothing else. A flag that" >&2
  echo "       is already true may be true on purpose, and turning it off here" >&2
  echo "       would end someone else's window. Settle that first." >&2
  exit 1
fi

# ── Cleanup, on every exit path ──────────────────────────────────────────────
#
# One handler, not one per step: a second trap REPLACES the first, so a later
# step installing its own would silently stop restoring the values file.

ORIGINAL_TFVARS=""
WINDOW_APPLIED=0
CYCLE_COMPLETE=0
TMPS=()

cleanup() {
  local f
  for f in ${TMPS[@]+"${TMPS[@]}"}; do
    [[ -n "$f" ]] && rm -f "$f" 2>/dev/null
  done
  # Restore the declared value. This undoes what the run itself wrote and
  # nothing beyond it.
  if [[ -n "$ORIGINAL_TFVARS" && -f "$TFVARS_PATH" ]]; then
    if [[ "$(read_flag "$TFVARS_PATH")" != "$CURRENT" ]]; then
      printf '%s' "$ORIGINAL_TFVARS" > "$TFVARS_PATH"
      echo "  values file restored to $TFVAR_NAME = $CURRENT" >&2
    fi
  fi
  # The live environment is a different matter. If the window went up and the
  # closing apply did not run, production is still serving the maintenance page
  # and only an apply brings it back. This run will not apply unattended, so it
  # says so instead, as loudly as it can.
  if (( WINDOW_APPLIED == 1 && CYCLE_COMPLETE == 0 )); then
    echo "" >&2
    echo "########################################################################" >&2
    echo "## PRODUCTION IS STILL SERVING THE MAINTENANCE PAGE." >&2
    echo "##" >&2
    echo "## This run put the window up and did not take it down. The values" >&2
    echo "## file has been restored to $TFVAR_NAME = false, so the fix is one" >&2
    echo "## apply with no further edit:" >&2
    echo "##" >&2
    echo "##     bash scripts/terraform-apply.sh --target production" >&2
    echo "##" >&2
    echo "## Nothing will alarm on this state. The CloudFront 5xx alarm counts" >&2
    echo "## the window's own 503s and cannot tell them from an outage." >&2
    echo "########################################################################" >&2
  fi
  return 0
}
trap cleanup EXIT INT TERM

ORIGINAL_TFVARS="$(cat "$TFVARS_PATH")"

# ── Where to verify ──────────────────────────────────────────────────────────

if [[ -z "$DOMAIN" && "$SYNTHETIC" -eq 0 ]]; then
  DOMAIN="$(terraform -chdir="$TF_DIR" output -raw cloudfront_domain 2>/dev/null || true)"
  if [[ -z "$DOMAIN" || "$DOMAIN" == "null" ]]; then
    echo "ERROR: could not read the distribution domain from terraform output." >&2
    echo "       Pass it with --domain, or initialise the tree first." >&2
    exit 1
  fi
fi
DOMAIN="${DOMAIN:-synthetic.invalid}"

PAGE_PATH="/maintenance.html"
# Page paths, chosen to span the routing rather than repeat it: the site root,
# a top-level section, and a deep path. Asset and health prefixes are
# deliberately absent -- they ride ordered behaviours the flag does not touch,
# so including them would assert the opposite of the contract.
PAGE_PATHS=(/ /events /freestyle/tricks)

PASS=0
FAIL=0
pass() { printf '  ok    %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

# Status and body together. Status alone is not the outcome: an empty bucket
# answers 403 and CloudFront hands that status straight to the viewer, and a
# window that served the storage service's XML would still have a 5xx in it.
fetch_status() {
  "$CURL_CMD" -s -o /dev/null -w '%{http_code}' --max-time 20 "https://${DOMAIN}$1" 2>/dev/null || echo "000"
}
fetch_body() {
  "$CURL_CMD" -s --max-time 20 "https://${DOMAIN}$1" 2>/dev/null || true
}

# The marker comes from the committed page rather than being restated here, so a
# reworded page cannot leave this check asserting text that no longer exists.
PAGE_SOURCE="$TF_DIR/maintenance-page/maintenance.html"
if [[ ! -f "$PAGE_SOURCE" ]]; then
  echo "ERROR: no page source at $PAGE_SOURCE." >&2
  exit 1
fi
PAGE_MARKER="$(sed -n 's/.*<h1>\(.*\)<\/h1>.*/\1/p' "$PAGE_SOURCE" | head -1)"
if [[ -z "$PAGE_MARKER" ]]; then
  echo "ERROR: could not read a heading out of $PAGE_SOURCE to verify against." >&2
  exit 1
fi

run_apply() {
  echo ""
  echo "-- apply: $TARGET --"
  if ! "$APPLY_CMD" --target "$TARGET"; then
    echo "ERROR: the apply failed." >&2
    return 1
  fi
  return 0
}

write_flag() {
  local value="$1" tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/footbag-maint-tfvars.XXXXXX")"
  TMPS+=("$tmp")
  VALUE="$value" VAR_NAME="$TFVAR_NAME" awk '
    BEGIN { pattern = "^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*=" }
    $0 ~ pattern && !done {
      match($0, pattern "[ \t]*")
      printf "%s%s\n", substr($0, 1, RLENGTH), ENVIRON["VALUE"]
      done = 1
      next
    }
    { print }
  ' "$TFVARS_PATH" > "$tmp"
  # Written through the symlink with cat, never mv: mv replaces the link itself
  # and the values file stops resolving into the private checkout.
  cat "$tmp" > "$TFVARS_PATH"
}

# ── Precondition: the page is actually in the bucket ─────────────────────────

echo "== planned-maintenance rehearsal: $TARGET =="
echo "   verifying against: $DOMAIN"
echo ""
# Said up front because four identical prompts in one run is how an operator
# learns to type through them without reading, which is the opposite of what they
# are for. Two are this script's, two belong to the apply wrapper it calls, and
# the two that matter are the ones carrying a plan.
echo "This run will stop for a typed APPLY four times, in this order:"
echo ""
echo "  1. here, to raise the window. Everything after it is public downtime."
echo "  2. the apply wrapper, AFTER showing you a plan. Read that one: the"
echo "     default cache behaviour's origin should move to the maintenance"
echo "     bucket and 403/404 error mappings should appear. Anything touching"
echo "     the database, the host or DNS means the tree carries other pending"
echo "     work, and you should answer no."
echo "  3. here, to take the window down."
echo "  4. the apply wrapper again, AFTER showing you the reverse plan."
echo ""
echo "Between 1 and 4 the site is down to the public. There is no timer: the"
echo "window stays up for as long as you take over the plans."
echo ""
echo "-- precondition: the page object is in place --"
PAGE_STATUS="$(fetch_status "$PAGE_PATH")"
if [[ "$PAGE_STATUS" != "200" ]]; then
  echo "ERROR: $PAGE_PATH answered $PAGE_STATUS, expected 200." >&2
  echo "       The page object is not in the bucket, so raising the window would" >&2
  echo "       serve the storage service's error on every path instead of the" >&2
  echo "       branded page. Terraform places the object; run the apply first:" >&2
  echo "" >&2
  echo "           bash scripts/terraform-apply.sh --target $TARGET" >&2
  exit 1
fi
pass "$PAGE_PATH: 200 before the window"

# ── Raise the window ─────────────────────────────────────────────────────────

echo ""
echo "-- raising the window --"
echo "This applies to $TARGET and every page path will serve the maintenance"
echo "page until this run takes it down. Expect the CloudFront 5xx alarm to fire:"
echo "it counts the window's own 503s and cannot tell them from an outage. It"
echo "clears through its own OK action when the window comes down."
echo ""
if ! confirm_from_tty "Type APPLY to raise the maintenance window on ${TARGET}: " "APPLY"; then
  echo "Aborted: nothing changed." >&2
  exit 1
fi

write_flag true
run_apply || exit 1
WINDOW_APPLIED=1

# ── Verify the window ────────────────────────────────────────────────────────

echo ""
echo "-- verifying the window --"
for p in "${PAGE_PATHS[@]}"; do
  status="$(fetch_status "$p")"
  body="$(fetch_body "$p")"
  if [[ "$status" != "503" ]]; then
    fail "$p: expected 503 while the window is up, got $status"
  elif [[ "$body" != *"$PAGE_MARKER"* ]]; then
    fail "$p: 503 but not the branded page; the body does not carry the page heading"
  else
    pass "$p: 503 carrying the maintenance page"
  fi
done

# The page's own URL has to keep answering: the custom-error routing resolves
# against it, so a window where this broke would be serving nothing at all.
status="$(fetch_status "$PAGE_PATH")"
if [[ "$status" == "200" ]]; then
  pass "$PAGE_PATH: still 200 while the window is up"
else
  fail "$PAGE_PATH: expected 200 while the window is up, got $status"
fi

# ── Take it down ─────────────────────────────────────────────────────────────

echo ""
echo "-- taking the window down --"
if ! confirm_from_tty "Type APPLY to return ${TARGET} to normal service: " "APPLY"; then
  echo "Refused to take the window down. Production is still serving the page." >&2
  exit 1
fi

write_flag false
run_apply || exit 1
CYCLE_COMPLETE=1

echo ""
echo "-- verifying normal service --"
for p in "${PAGE_PATHS[@]}"; do
  status="$(fetch_status "$p")"
  if [[ "$status" == "200" ]]; then
    pass "$p: 200, serving the platform again"
  else
    fail "$p: expected 200 after the window, got $status"
  fi
done

echo ""
echo "  passed: ${PASS}   failed: ${FAIL}"
if [[ "$FAIL" -gt 0 ]]; then
  echo "GATE: PLANNED-MAINTENANCE FAIL: ${FAIL} expectation(s) unmet"
  exit 1
fi
echo "GATE: PLANNED-MAINTENANCE PASS: the window raised, served the branded page"
echo "      on every page path, and came down again with the flag back to false."
exit 0

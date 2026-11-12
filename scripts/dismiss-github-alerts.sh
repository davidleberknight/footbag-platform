#!/usr/bin/env bash
# dismiss-github-alerts.sh -- dismiss a reviewed set of GitHub security alerts,
# CodeQL code-scanning or Dependabot, each with its reason and comment, and read
# every one back.
#
# Triage decides which alerts are false alarms for this repository; this script
# only carries out that decision, from a plan file, so each dismissal carries
# the reason a reviewer can read later and nothing outside the plan is touched.
#
# The plan is a JSON array of {"number": <alert>, "reason": <reason>,
# "comment": <text>}. The reason is one GitHub accepts for the kind of alert:
#   code-scanning: "false positive", "won't fix", "used in tests", "mitigated"
#   dependabot:    "fix_started", "inaccurate", "no_bandwidth", "not_used",
#                  "tolerable_risk"
# The comment is required and at most 280 characters, GitHub's limit.
#
# Before writing anything it reads every alert in the plan. An alert already
# dismissed with the same reason and comment is done and left alone, so a run
# stopped part way finishes on a re-run. An alert that is fixed, dismissed with
# another reason, or dismissed by a repository rule, is left alone and
# reported, since the plan was written for a state that no longer holds.
#
# What it refuses:
#   - a --kind other than code-scanning or dependabot; there is no default.
#   - a plan that is not a JSON array, names an alert twice, or carries a reason
#     GitHub does not accept for that kind or a comment that is empty or over
#     280 characters.
#   - an alert number the repository does not have.
#   - to dismiss anything without the typed APPLY, unless --yes is given. The
#     list of alerts to dismiss is shown first.
#
# Usage:
#   bash scripts/dismiss-github-alerts.sh --kind <code-scanning|dependabot> \
#     --repo <owner/name> --plan <file> [--yes]
#
# Exit: 0 every planned alert is dismissed as planned, 1 a step failed or an
# alert was left in another state, 2 usage error.
#
# Test seam (CI only; operators never set it), announced on stderr:
#   DISMISS_ALERTS_GH_BIN   replaces the gh CLI
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

KIND=""
REPO=""
PLAN=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kind) [[ $# -ge 2 ]] || { echo "ERROR: --kind needs a value" >&2; exit 2; }; KIND="$2"; shift 2 ;;
    --repo) [[ $# -ge 2 ]] || { echo "ERROR: --repo needs a value" >&2; exit 2; }; REPO="$2"; shift 2 ;;
    --plan) [[ $# -ge 2 ]] || { echo "ERROR: --plan needs a file" >&2; exit 2; }; PLAN="$2"; shift 2 ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
case "$KIND" in
  code-scanning) REASONS='["false positive", "won'"'"'t fix", "used in tests", "mitigated"]' ;;
  dependabot) REASONS='["fix_started", "inaccurate", "no_bandwidth", "not_used", "tolerable_risk"]' ;;
  *) echo "ERROR: give --kind as code-scanning or dependabot" >&2; exit 2 ;;
esac
[[ "$REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || { echo "ERROR: give --repo as owner/name" >&2; exit 2; }
[[ -n "$PLAN" && -f "$PLAN" ]] || { echo "ERROR: give --plan as a file that exists" >&2; exit 2; }

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

GH_BIN="${DISMISS_ALERTS_GH_BIN:-gh}"
[[ -n "${DISMISS_ALERTS_GH_BIN:-}" ]] && echo "NOTE: using a stand-in for the gh CLI; this run proves nothing about the repository." >&2
command -v jq >/dev/null 2>&1 || cr_die "jq is not installed, and the plan and the alerts are read with it."

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/footbag-dismiss-alerts.XXXXXX")"
cr_cleanup rm -rf "$WORK_DIR"
ALERTS="repos/${REPO}/${KIND}/alerts"

# ── The plan ─────────────────────────────────────────────────────────────────

PLAN_CHECK='
  if type != "array" then "the plan is not a JSON array"
  elif length == 0 then "the plan names no alert"
  elif ([.[].number] | length) != ([.[].number] | unique | length) then "the plan names an alert more than once"
  else (.[] | select(
      ((.number | type) != "number") or (.number < 1) or (.number != (.number | floor))
      or ((.reason as $r | $reasons | index($r)) == null)
      or ((.comment | type) != "string") or ((.comment | length) == 0) or ((.comment | length) > 280)
    ) | "alert entry \(.number | tostring) has no whole-number alert, a reason GitHub does not accept for this kind, or a comment that is empty or over 280 characters")
  end'
problems="$(jq -r --argjson reasons "$REASONS" "$PLAN_CHECK" "$PLAN" 2> "${WORK_DIR}/jq.err")" \
  || cr_die "the plan ${PLAN} is not valid JSON: $(tail -n 1 "${WORK_DIR}/jq.err")"
[[ -z "$problems" ]] || cr_die "the plan was refused: ${problems//$'\n'/; }"
total="$(jq 'length' "$PLAN")"
echo "Repository: ${REPO} (${KIND} alerts)"
echo "Plan: ${total} alert(s) from ${PLAN}"

# ── Where each alert stands ──────────────────────────────────────────────────

to_dismiss=()
done_count=0
while IFS=$'\t' read -r number reason comment; do
  if ! "$GH_BIN" api "${ALERTS}/${number}" > "${WORK_DIR}/a.json" 2> "${WORK_DIR}/gh.err"; then
    cr_die "could not read ${KIND} alert ${number} of ${REPO}: $(tail -n 1 "${WORK_DIR}/gh.err")"
  fi
  state="$(jq -r '.state' "${WORK_DIR}/a.json")"
  have_reason="$(jq -r '.dismissed_reason // ""' "${WORK_DIR}/a.json")"
  have_comment="$(jq -r '.dismissed_comment // ""' "${WORK_DIR}/a.json")"
  if [[ "$state" == open ]]; then
    to_dismiss+=("$number")
  elif [[ "$state" == dismissed && "$have_reason" == "$reason" && "$have_comment" == "$comment" ]]; then
    done_count=$((done_count + 1))
  else
    cr_warn "alert ${number} is ${state}${have_reason:+ (${have_reason})}, not open; left as it is, since the plan was written for an open alert"
  fi
done < <(jq -r '.[] | [(.number | tostring), .reason, (.comment | gsub("[\t\n]"; " "))] | @tsv' "$PLAN")

if (( done_count > 0 )); then
  echo "${done_count} alert(s) already dismissed as planned."
fi
if (( ${#to_dismiss[@]} == 0 )); then
  cr_proved "no planned alert is left open"
  cr_finish
fi

echo ""
echo "About to dismiss ${#to_dismiss[@]} open ${KIND} alert(s) on ${REPO}, each with its planned reason and comment:"
echo "  ${to_dismiss[*]}"
echo ""
if ! confirm_from_tty "Type 'APPLY' to dismiss them: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  cr_unproved "the dismissals: not confirmed, and nothing was changed"
  cr_finish_with 1 ABORTED
fi

# ── Dismiss, then read each back ─────────────────────────────────────────────

dismissed=0
for number in "${to_dismiss[@]}"; do
  reason="$(jq -r --argjson n "$number" '.[] | select(.number == $n) | .reason' "$PLAN")"
  comment="$(jq -r --argjson n "$number" '.[] | select(.number == $n) | .comment' "$PLAN")"
  if ! "$GH_BIN" api --method PATCH "${ALERTS}/${number}" \
      -f state=dismissed -f "dismissed_reason=${reason}" -f "dismissed_comment=${comment}" \
      > /dev/null 2> "${WORK_DIR}/gh.err"; then
    cr_error "GitHub refused to dismiss alert ${number}: $(tail -n 1 "${WORK_DIR}/gh.err")"
    continue
  fi
  if ! "$GH_BIN" api "${ALERTS}/${number}" > "${WORK_DIR}/b.json" 2> "${WORK_DIR}/gh.err"; then
    cr_error "alert ${number} was dismissed but could not be read back: $(tail -n 1 "${WORK_DIR}/gh.err")"
    continue
  fi
  if [[ "$(jq -r '[.state, (.dismissed_reason // "")] | join("|")' "${WORK_DIR}/b.json")" != "dismissed|${reason}" ]]; then
    cr_error "alert ${number} reads back as $(jq -r '.state' "${WORK_DIR}/b.json") after the dismissal"
    continue
  fi
  dismissed=$((dismissed + 1))
done

cr_proved "${dismissed} of ${#to_dismiss[@]} ${KIND} alert(s) dismissed and read back with the planned reason"
cr_finish

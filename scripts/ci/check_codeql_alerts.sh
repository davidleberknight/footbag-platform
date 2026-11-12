#!/usr/bin/env bash
# CodeQL gate: fails when the repository holds any open CodeQL alert of high or
# critical security severity on the given branch.
#
# The analysis step only uploads its findings, so a run that finds a serious
# alert still ends green and the alert waits in the code-scanning list for
# someone to look. This reads that list after the upload, so the verdict
# honours the triage done there: an alert dismissed in GitHub with its reason
# no longer counts, and an alert fixed by a later commit closes on its own.
#
# It refuses rather than passes when the list cannot be read, because a check
# that cannot see the alerts has not found that there are none.
#
# Usage: check_codeql_alerts.sh --repo <owner/name> --ref <refs/heads/branch>
#   In GitHub Actions both default from GITHUB_REPOSITORY and GITHUB_REF.
#
# Exit: 0 no open high or critical alert, 1 at least one, or the list could
# not be read, 2 usage error.
#
# Test seam (CI only; operators never set it), announced on stderr:
#   CODEQL_ALERTS_GH_BIN   replaces the gh CLI
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-}"
REF="${GITHUB_REF:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) [[ $# -ge 2 ]] || { echo "ERROR: --repo needs a value" >&2; exit 2; }; REPO="$2"; shift 2 ;;
    --ref)  [[ $# -ge 2 ]] || { echo "ERROR: --ref needs a value" >&2; exit 2; };  REF="$2";  shift 2 ;;
    -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "ERROR: give --repo as owner/name" >&2; exit 2; }
[[ "$REF" == refs/* ]] || { echo "ERROR: give --ref as a full ref, such as refs/heads/main" >&2; exit 2; }

GH_BIN="${CODEQL_ALERTS_GH_BIN:-gh}"
[[ -n "${CODEQL_ALERTS_GH_BIN:-}" ]] && echo "NOTE: using a stand-in for the gh CLI; this run proves nothing about the repository." >&2
command -v jq >/dev/null 2>&1 || { echo "[codeql-alerts] FAIL: jq is not installed, and the alert list is read with it." >&2; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/footbag-codeql-alerts.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT INT TERM HUP

# --paginate prints one JSON array per page; jq reads them one after another.
if ! "$GH_BIN" api --paginate \
    "repos/${REPO}/code-scanning/alerts?state=open&tool_name=CodeQL&per_page=100&ref=${REF}" \
    > "${WORK}/alerts.json" 2> "${WORK}/gh.err"; then
  echo "gh: $(tr '\n' ' ' < "${WORK}/gh.err")" >&2
  echo "[codeql-alerts] FAIL: could not read the open alerts for ${REF}; nothing was checked." >&2
  exit 1
fi

if ! serious=$(jq -r '
    .[]
    | select(.rule.security_severity_level == "high" or .rule.security_severity_level == "critical")
    | "#\(.number) \(.rule.security_severity_level) \(.rule.id) \(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line)"
  ' "${WORK}/alerts.json" 2> "${WORK}/jq.err"); then
  echo "jq: $(tr '\n' ' ' < "${WORK}/jq.err")" >&2
  echo "[codeql-alerts] FAIL: the alert list for ${REF} did not parse; nothing was checked." >&2
  exit 1
fi

if [[ -n "$serious" ]]; then
  printf 'open high or critical CodeQL alerts on %s:\n%s\n' "$REF" "$serious" >&2
  echo "[codeql-alerts] FAIL: $(grep -c . <<< "$serious") open high or critical alert(s); fix each or dismiss it in GitHub with its reason." >&2
  exit 1
fi
echo "[codeql-alerts] pass: no open high or critical CodeQL alert on ${REF}"

#!/usr/bin/env bash
# github-ruleset.sh -- hold the public repository's protect-main ruleset to the
# copy committed beside this script, and put it back when it differs.
#
# The branch protection on main is a repository setting, and a setting changed
# in the web interface leaves no record anywhere: nothing notices it switched
# off, a rule quietly added, or an entry allowed to bypass it. The intended
# ruleset is committed as scripts/github-ruleset-protect-main.json, and it is the
# target from go-live on: active on the default branch, blocking its deletion
# and any force push, and requiring a pull request before anything merges into
# main (no approving review, code-owner review or resolved threads required),
# with no bypass entry and no required status check. Until go-live, main takes
# direct pushes and carries no such ruleset, so --verify reports that gap and
# that is expected. --apply is a go-live-day step and is never run before
# go-live. --verify compares the live ruleset with the committed copy; --apply
# makes the live one match.
#
# The comparison covers what the ruleset does: its name, target, enforcement,
# conditions, rules and bypass entries. GitHub's own bookkeeping (ids, node ids,
# links, timestamps, the source and what the caller may bypass) is left out, and
# the rules and bypass entries are compared as sets, since GitHub returns them
# in no promised order.
#
# The repository is the public one this checkout's origin remote names, read
# when the script runs, so no repository name is written into this tree.
#
# What it refuses:
#   - two live rulesets both named protect-main, which leaves no single one to
#     hold to the committed copy.
#   - an origin remote that is not a GitHub repository.
#   - to change the live ruleset without the typed APPLY, unless --yes is given.
#     The diff is shown first.
#
# Usage:
#   bash scripts/github-ruleset.sh --verify
#   bash scripts/github-ruleset.sh --apply [--yes]
#
#   --verify   read the live ruleset and compare it with the committed copy.
#              Changes nothing.
#   --apply    go-live day only, never before: when the live ruleset differs,
#              show the difference, confirm, and
#              replace it with the committed copy (creating it when there is
#              none), then read it back and compare again.
#   --yes      with --apply, accept the confirmation without being asked.
#
# Exit: 0 the live ruleset matches (or now matches), 1 it differs or a step
# failed, 2 usage error.
#
# Test seams (CI only; operators never set these), each announced on stderr:
#   GITHUB_RULESET_GH_BIN       replaces the gh CLI
#   GITHUB_RULESET_ORIGIN_URL   replaces the origin remote read from git
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

RULESET_NAME="protect-main"
COMMITTED="${SCRIPT_DIR}/github-ruleset-protect-main.json"
MODE=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verify|--apply)
      [[ -z "$MODE" ]] || { echo "ERROR: give one of --verify or --apply, not both" >&2; exit 2; }
      MODE="${1#--}"; shift ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
[[ -n "$MODE" ]] || { echo "ERROR: give --verify or --apply" >&2; exit 2; }
if [[ "$ASSUME_YES" == "yes" && "$MODE" != apply ]]; then
  echo "ERROR: --yes goes with --apply; --verify asks nothing." >&2
  exit 2
fi

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

GH_BIN="${GITHUB_RULESET_GH_BIN:-gh}"
[[ -n "${GITHUB_RULESET_GH_BIN:-}" ]] && echo "NOTE: using a stand-in for the gh CLI; this run proves nothing about the repository." >&2
[[ -n "${GITHUB_RULESET_ORIGIN_URL:-}" ]] && echo "NOTE: using a stand-in origin remote; this run is not about this checkout's repository." >&2

command -v jq >/dev/null 2>&1 || cr_die "jq is not installed, and the rulesets are compared with it."

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/footbag-github-ruleset.XXXXXX")"
cr_cleanup rm -rf "$WORK_DIR"

# ── Which repository ─────────────────────────────────────────────────────────

if [[ -n "${GITHUB_RULESET_ORIGIN_URL:-}" ]]; then
  ORIGIN="$GITHUB_RULESET_ORIGIN_URL"
elif ! ORIGIN="$(git -C "$REPO_ROOT" remote get-url origin 2> "${WORK_DIR}/git.err")"; then
  cr_die "this checkout has no origin remote to name the repository: $(tail -n 1 "${WORK_DIR}/git.err")"
fi
# A URL's user-info part (a user name and token before the host, ending in an
# at sign) can carry a credential, so it is removed before the URL is parsed or
# shown; the raw remote is never printed.
ORIGIN="$(sed -E 's#^([A-Za-z][A-Za-z0-9+.-]*://)[^/@]*@#\1#' <<< "$ORIGIN")"
# git@github.com:<owner>/<repo>.git and https://github.com/<owner>/<repo>(.git)
REPO="$(sed -nE 's#^(git@github\.com:|https://github\.com/|ssh://github\.com/)([^/]+/[^/]+)/?$#\2#p' <<< "$ORIGIN")"
REPO="${REPO%.git}"
[[ "$REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] \
  || cr_die "the origin remote (${ORIGIN}) is not a GitHub repository this script can name."
echo "Repository: ${REPO}"

# ── The two sides, in one form ───────────────────────────────────────────────

# What the ruleset does, without GitHub's bookkeeping; rules and bypass entries
# sorted, since their order carries no meaning.
NORMALISE='{
  name, target, enforcement,
  conditions: (.conditions // {}),
  rules: ((.rules // []) | sort_by(.type, (.parameters // {} | tostring))),
  bypass_actors: ((.bypass_actors // []) | sort_by(.actor_type, (.actor_id | tostring), .bypass_mode))
}'
jq -S "$NORMALISE" "$COMMITTED" > "${WORK_DIR}/committed.json" \
  || cr_die "the committed ruleset ${COMMITTED} is not valid JSON."

# read_live: sets RULESET_ID (empty when there is none) and writes the live
# ruleset, normalised, to live.json.
RULESET_ID=""
read_live() {
  local list="${WORK_DIR}/list.json" ids
  if ! "$GH_BIN" api "repos/${REPO}/rulesets?per_page=100" > "$list" 2> "${WORK_DIR}/gh.err"; then
    cr_die "could not list the rulesets of ${REPO}: $(tail -n 1 "${WORK_DIR}/gh.err")"
  fi
  ids="$(jq -r --arg n "$RULESET_NAME" '.[] | select(.name == $n) | .id' "$list")" \
    || cr_die "the rulesets of ${REPO} did not come back as JSON."
  if [[ -z "$ids" ]]; then
    RULESET_ID=""
    echo 'null' > "${WORK_DIR}/live.json"
    return 0
  fi
  if (( $(grep -c '' <<< "$ids") > 1 )); then
    cr_die "${REPO} has more than one ruleset named ${RULESET_NAME} (ids: ${ids//$'\n'/, }). Delete the extra one in the repository settings, then re-run."
  fi
  RULESET_ID="$ids"
  if ! "$GH_BIN" api "repos/${REPO}/rulesets/${RULESET_ID}" > "${WORK_DIR}/live.raw" 2> "${WORK_DIR}/gh.err"; then
    cr_die "could not read ruleset ${RULESET_ID} of ${REPO}: $(tail -n 1 "${WORK_DIR}/gh.err")"
  fi
  jq -S "$NORMALISE" "${WORK_DIR}/live.raw" > "${WORK_DIR}/live.json" \
    || cr_die "ruleset ${RULESET_ID} of ${REPO} did not come back as JSON."
}

# Prints the difference, committed copy first; returns 0 when there is none.
show_diff() {
  diff -u --label "committed ${COMMITTED##*/}" --label "live ${REPO} ${RULESET_NAME}" \
    "${WORK_DIR}/committed.json" "${WORK_DIR}/live.json" > "${WORK_DIR}/diff.txt" || [[ $? == 1 ]]
  [[ ! -s "${WORK_DIR}/diff.txt" ]] && return 0
  cat "${WORK_DIR}/diff.txt"
  return 1
}

read_live
if show_diff; then
  cr_proved "the live ${RULESET_NAME} ruleset of ${REPO} matches ${COMMITTED##*/}"
  cr_finish
fi

if [[ "$MODE" == verify ]]; then
  if [[ -z "$RULESET_ID" ]]; then
    cr_error "${REPO} has no ruleset named ${RULESET_NAME}; expected until go-live, when --apply creates it from ${COMMITTED##*/}"
  else
    cr_error "the live ${RULESET_NAME} ruleset of ${REPO} differs from ${COMMITTED##*/}, as shown above; expected until go-live, when --apply makes it match"
  fi
  cr_finish
fi

# ── Apply ────────────────────────────────────────────────────────────────────

echo ""
if [[ -z "$RULESET_ID" ]]; then
  echo "About to create the ${RULESET_NAME} ruleset on ${REPO} from ${COMMITTED##*/}."
else
  echo "About to replace ruleset ${RULESET_ID} (${RULESET_NAME}) on ${REPO} with ${COMMITTED##*/},"
  echo "removing the lines marked + above and adding the lines marked -."
fi
echo ""
if ! confirm_from_tty "Type 'APPLY' to write the ruleset: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  cr_unproved "the ruleset: not confirmed, and nothing was changed"
  cr_finish_with 1 ABORTED
fi

if [[ -z "$RULESET_ID" ]]; then
  "$GH_BIN" api --method POST "repos/${REPO}/rulesets" --input "$COMMITTED" > /dev/null 2> "${WORK_DIR}/gh.err" \
    || cr_die "GitHub refused to create the ruleset: $(tail -n 1 "${WORK_DIR}/gh.err")"
else
  "$GH_BIN" api --method PUT "repos/${REPO}/rulesets/${RULESET_ID}" --input "$COMMITTED" > /dev/null 2> "${WORK_DIR}/gh.err" \
    || cr_die "GitHub refused to update ruleset ${RULESET_ID}: $(tail -n 1 "${WORK_DIR}/gh.err")"
fi

# The outcome, read back: GitHub accepting the write is not the ruleset matching.
read_live
if ! show_diff; then
  cr_die "GitHub accepted the write, but the live ruleset still differs from ${COMMITTED##*/}, as shown above."
fi
cr_proved "the live ${RULESET_NAME} ruleset of ${REPO} was written and read back matching ${COMMITTED##*/}"
cr_finish

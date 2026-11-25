#!/usr/bin/env bash
# github-ruleset.sh -- hold the public repository's protect-main ruleset to the
# copy committed beside this script, and put it back when it differs.
#
# The branch protection on main is a repository setting, and a setting changed
# in the web interface leaves no record anywhere: nothing notices it switched
# off, a rule quietly added, or an entry allowed to bypass it. The intended
# ruleset is committed as scripts/github-ruleset-protect-main.json: active on
# the default branch, blocking its deletion and any force push, and requiring a
# pull request before anything merges into main with one approving review (no
# code-owner review or resolved threads required). The repository admin role
# may bypass the pull-request rule alone, since GitHub lets no author approve
# their own pull request, so the maintainer reviews every other contributor's
# change and can still merge their own; there is no required status check.
# It is the target after launch. Until the maintainer switches it on after
# launch, main takes direct pushes and carries no such ruleset, so --verify
# reports that gap and that is expected. --apply is run after launch, never
# before. --verify compares the live ruleset with the committed copy; --apply
# makes the live one match.
#
# The comparison covers what the ruleset does: its name, target, enforcement,
# conditions, rules and bypass entries. GitHub's own bookkeeping (ids, node ids,
# links, timestamps, the source and what the caller may bypass) is left out, and
# the rules and bypass entries are compared as sets, since GitHub returns them
# in no promised order.
#
# protect-main is the only ruleset main answers to. Any other branch ruleset
# whose conditions reach the default branch (by ~DEFAULT_BRANCH, ~ALL or the
# branch's own ref) is a second set of rules nothing holds to a committed copy,
# so --verify reports each one as a difference and --apply deletes it under
# the same confirmation, then reads the list back to prove it gone. A ruleset
# on other branches only, or on tags, is left alone.
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
#   --verify   read the live ruleset and compare it with the committed copy,
#              and list any other ruleset on the default branch. Changes
#              nothing.
#   --apply    after launch only, when the maintainer switches pull requests
#              on: when the live ruleset differs or another ruleset
#              reaches the default branch, show the difference, confirm,
#              replace it with the committed copy (creating it when there is
#              none) and delete the others, then read it all back and compare
#              again.
#   --yes      with --apply, accept the confirmation without being asked.
#
# Exit: 0 the live ruleset matches (or now matches) and no other ruleset reaches
# the default branch, 1 either is not so or a step failed, 2 usage error.
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

# The default branch's name, read from the repository rather than assumed, so a
# ruleset naming that branch's own ref is recognised.
if ! "$GH_BIN" api "repos/${REPO}" > "${WORK_DIR}/repo.json" 2> "${WORK_DIR}/gh.err"; then
  cr_die "could not read ${REPO}: $(tail -n 1 "${WORK_DIR}/gh.err")"
fi
DEFAULT_BRANCH="$(jq -r '.default_branch // empty' "${WORK_DIR}/repo.json")" \
  || cr_die "${REPO} did not come back as JSON."
[[ -n "$DEFAULT_BRANCH" ]] || cr_die "${REPO} named no default branch."

# read_strays: reads every other ruleset from the list read_live just wrote and
# sets STRAY_IDS to those that reach the default branch, one line each in
# strays.txt. Run after read_live.
STRAY_IDS=()
read_strays() {
  local id raw reaches
  STRAY_IDS=()
  : > "${WORK_DIR}/strays.txt"
  for id in $(jq -r --arg n "$RULESET_NAME" '.[] | select(.name != $n) | .id' "${WORK_DIR}/list.json"); do
    raw="${WORK_DIR}/other-${id}.json"
    if ! "$GH_BIN" api "repos/${REPO}/rulesets/${id}" > "$raw" 2> "${WORK_DIR}/gh.err"; then
      cr_die "could not read ruleset ${id} of ${REPO}: $(tail -n 1 "${WORK_DIR}/gh.err")"
    fi
    reaches="$(jq -r --arg ref "refs/heads/${DEFAULT_BRANCH}" \
      '(.target == "branch") and ((.conditions.ref_name.include // []) | any(. == "~DEFAULT_BRANCH" or . == "~ALL" or . == $ref))' \
      "$raw")" || cr_die "ruleset ${id} of ${REPO} did not come back as JSON."
    if [[ "$reaches" != false ]]; then
      STRAY_IDS+=("$id")
      jq -r '"  ruleset \(.id), \"\(.name)\", \(.enforcement)"' "$raw" >> "${WORK_DIR}/strays.txt"
    fi
  done
}

read_live
read_strays
DIFFERS=no
show_diff || DIFFERS=yes
if [[ "$DIFFERS" == no && ${#STRAY_IDS[@]} -eq 0 ]]; then
  cr_proved "the live ${RULESET_NAME} ruleset of ${REPO} matches ${COMMITTED##*/}, and no other ruleset reaches ${DEFAULT_BRANCH}"
  cr_finish
fi
if (( ${#STRAY_IDS[@]} > 0 )); then
  echo "Other rulesets that reach ${DEFAULT_BRANCH}:"
  cat "${WORK_DIR}/strays.txt"
fi

if [[ "$MODE" == verify ]]; then
  if [[ -z "$RULESET_ID" ]]; then
    cr_error "${REPO} has no ruleset named ${RULESET_NAME}; expected until pull requests are switched on after launch, when --apply creates it from ${COMMITTED##*/}"
  elif [[ "$DIFFERS" == yes ]]; then
    cr_error "the live ${RULESET_NAME} ruleset of ${REPO} differs from ${COMMITTED##*/}, as shown above; --apply makes it match"
  fi
  if (( ${#STRAY_IDS[@]} > 0 )); then
    cr_error "${#STRAY_IDS[@]} other ruleset(s) of ${REPO} reach ${DEFAULT_BRANCH}, listed above; --apply deletes them"
  fi
  cr_finish
fi

# ── Apply ────────────────────────────────────────────────────────────────────

echo ""
if [[ "$DIFFERS" == yes && -z "$RULESET_ID" ]]; then
  echo "About to create the ${RULESET_NAME} ruleset on ${REPO} from ${COMMITTED##*/}."
elif [[ "$DIFFERS" == yes ]]; then
  echo "About to replace ruleset ${RULESET_ID} (${RULESET_NAME}) on ${REPO} with ${COMMITTED##*/},"
  echo "removing the lines marked + above and adding the lines marked -."
fi
if (( ${#STRAY_IDS[@]} > 0 )); then
  echo "About to delete every other ruleset listed above from ${REPO}. A deleted ruleset"
  echo "cannot be restored; it can only be created again by hand."
fi
echo ""
if ! confirm_from_tty "Type 'APPLY' to write the ruleset: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  cr_unproved "the ruleset: not confirmed, and nothing was changed"
  cr_finish_with 1 ABORTED
fi

if [[ "$DIFFERS" == yes && -z "$RULESET_ID" ]]; then
  "$GH_BIN" api --method POST "repos/${REPO}/rulesets" --input "$COMMITTED" > /dev/null 2> "${WORK_DIR}/gh.err" \
    || cr_die "GitHub refused to create the ruleset: $(tail -n 1 "${WORK_DIR}/gh.err")"
elif [[ "$DIFFERS" == yes ]]; then
  "$GH_BIN" api --method PUT "repos/${REPO}/rulesets/${RULESET_ID}" --input "$COMMITTED" > /dev/null 2> "${WORK_DIR}/gh.err" \
    || cr_die "GitHub refused to update ruleset ${RULESET_ID}: $(tail -n 1 "${WORK_DIR}/gh.err")"
fi
for id in "${STRAY_IDS[@]}"; do
  "$GH_BIN" api --method DELETE "repos/${REPO}/rulesets/${id}" > /dev/null 2> "${WORK_DIR}/gh.err" \
    || cr_die "GitHub refused to delete ruleset ${id}: $(tail -n 1 "${WORK_DIR}/gh.err")"
done

# The outcome, read back: GitHub accepting the write is not the ruleset matching.
read_live
read_strays
if ! show_diff; then
  cr_die "GitHub accepted the write, but the live ruleset still differs from ${COMMITTED##*/}, as shown above."
fi
if (( ${#STRAY_IDS[@]} > 0 )); then
  cat "${WORK_DIR}/strays.txt"
  cr_die "GitHub accepted the deletes, but these rulesets still reach ${DEFAULT_BRANCH}."
fi
cr_proved "the live ${RULESET_NAME} ruleset of ${REPO} was read back matching ${COMMITTED##*/}, with no other ruleset reaching ${DEFAULT_BRANCH}"
cr_finish

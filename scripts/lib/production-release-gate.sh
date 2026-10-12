#!/usr/bin/env bash
# scripts/lib/production-release-gate.sh -- the release rules for production, and
# whether a tree meets them.
#
# Sourced, never run. Only the IAM user footbag-operator deploys production; the
# FootbagDevTester job role reaches staging only, where either may deploy. Every
# path that ships code to production checks these rules before it touches a host:
# the entry point deploy_to_aws.sh, and the leaves it hands off to
# (scripts/deploy-code.sh, which scripts/deploy-migrate.sh execs, and
# scripts/deploy-rebuild.sh) call production_release_gate_deploy.
# scripts/verify-production-release.sh asks the same question on demand, through
# production_release_gate_require, so an operator can see before a deploy whether
# it would be allowed.
#
# The test proof for a production release is continuous integration's green tick
# on the exact commit that ships. Continuous integration and the local run carry
# the same tests, so what ships is exactly what CI proved: a committed tree, on
# the canonical repository's main, whose CI aggregate check succeeded on every
# run. Anything less is refused, because nothing else records that its tests
# passed. Staging is held to none of this, and none of it is about staging.
#
# REFUSED, every one of them:
#   - SKIP_SMOKE=yes, which switches off the smoke check of the deployed site;
#   - FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK or FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT, which
#     ship code past the schema-drift check, and FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS,
#     which kills whatever holds the database lock without asking;
#   - a test seam variable set on a deploy (below);
#   - a working tree that is not clean, or whose state cannot be read;
#   - an origin other than the canonical repository, so a fork's main and a
#     fork's CI can never stand in for the real ones;
#   - a main that cannot be fetched, so where HEAD stands cannot be known;
#   - a HEAD that main does not contain;
#   - a CI aggregate check ("Type-check and test") that did not succeed on every
#     run of this commit: finished red, still running, or not readable at all,
#     as for an unpushed commit.
#
# WARNED, and allowed: a HEAD that is an earlier commit of main rather than its
# tip. That is a rollback to a commit CI already proved, the fastest safe answer
# to a bad release.
#
# Every outside call runs non-interactively with a time limit: git never asks for
# a username or a key passphrase, and an offline machine is a refusal rather
# than a hang.
#
# TEST SEAM: FOOTBAG_GH_BIN replaces gh. It is honoured only when the caller
# passes --allow-seams (the standalone check, which its suite drives) and is
# never honoured on a deploy, so an exported variable can never make a deploy
# report a CI result it does not have.

PRODUCTION_RELEASE_CI_CHECK="Type-check and test"
PRODUCTION_RELEASE_CANONICAL_SLUG="davidleberknight/footbag-platform"
PRODUCTION_RELEASE_TIMEOUT=60

# _prg_slug <url> -- owner/repo from a GitHub remote URL, or empty.
_prg_slug() {
  printf '%s' "$1" | sed -nE 's#^(git@github\.com:|ssh://git@github\.com/|https://([^@/]+@)?github\.com/)([^/]+/[^/]+)$#\3#p' \
    | sed -E 's#/+$##; s#\.git$##'
}

# production_release_gate_require <repo-root> [--allow-seams]
# The standalone question: would a production deploy of this tree be allowed?
# Prints every refusal with what to do about it and returns 1, or prints any
# warning and the pass line and returns 0.
production_release_gate_require() {
  _prg_collect "$@"
  _prg_report
}

# production_release_gate_deploy <repo-root>
# The form every production deploy runs: the same rules, with no test seam
# honoured. Returns 1 when any rule refuses, else 0.
production_release_gate_deploy() {
  _prg_collect "$1"
  _prg_report
}

_prg_report() {
  if (( ${#PRG_BLOCKERS[@]} > 0 )); then
    echo "ERROR: this tree may not ship to production:" >&2
    printf '  - %s\n' "${PRG_BLOCKERS[@]}" >&2
  fi
  if (( ${#PRG_WARNINGS[@]} > 0 )); then
    echo "WARNING:" >&2
    printf '  - %s\n' "${PRG_WARNINGS[@]}" >&2
  fi
  (( ${#PRG_BLOCKERS[@]} > 0 )) && return 1
  echo "==> Production release gate: clean, on main, CI green on every run for this commit." >&2
  return 0
}

# _prg_collect <repo-root> [--allow-seams]
# Fills PRG_BLOCKERS with every rule that refuses and PRG_WARNINGS with the
# rollback warning, each with what to do about it. Reads only: it changes nothing
# anywhere, apart from fetching the canonical main into this repository's
# origin/main.
_prg_collect() {
  local root="$1" allow_seams=0
  [[ "${2:-}" == "--allow-seams" ]] && allow_seams=1
  PRG_BLOCKERS=()
  PRG_WARNINGS=()
  local blockers=() warnings=() head main slug status_out
  local gh_bin=gh runs

  if [[ -n "${FOOTBAG_GH_BIN:-}" ]]; then
    if (( allow_seams == 0 )); then
      blockers+=("FOOTBAG_GH_BIN is set; test seams are never honoured on a production deploy (unset it)")
    else
      echo "TEST SEAM: FOOTBAG_GH_BIN=${FOOTBAG_GH_BIN}; this run proves nothing about the real estate." >&2
      gh_bin="$FOOTBAG_GH_BIN"
    fi
  fi

  echo "==> Production release gate: checking this tree may ship to production ..." >&2
  export GIT_TERMINAL_PROMPT=0
  export GIT_SSH_COMMAND="ssh -o BatchMode=yes"

  # Each switches off a step that protects what the public is served.
  [[ "${SKIP_SMOKE:-no}" == "yes" ]] \
    && blockers+=("SKIP_SMOKE=yes: a production deploy always smoke-checks production once it is deployed; unset it")
  # Refused whatever value they carry: each one switches off a safety step of the
  # deploy, and an unexpected value is no reason to guess it means "off".
  [[ -n "${FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK:-}" ]] \
    && blockers+=("FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK is set: a production deploy never skips the schema-drift check; unset it")
  [[ -n "${FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT:-}" ]] \
    && blockers+=("FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT is set: a production deploy never ships code past a schema drift; unset it and resolve the drift")
  [[ -n "${FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS:-}" ]] \
    && blockers+=("FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS is set: a production deploy never kills what holds the database lock without asking; unset it")

  # Uncommitted changes would ship bytes no test has seen.
  if ! status_out="$(git -C "$root" status --porcelain </dev/null 2>/dev/null)"; then
    blockers+=("the working tree's state could not be read (git status failed)")
  elif [[ -n "$status_out" ]]; then
    blockers+=("the working tree is not clean; commit and push the change, let CI pass, and deploy that commit")
  fi

  head="$(git -C "$root" rev-parse HEAD 2>/dev/null || true)"
  slug="$(_prg_slug "$(git -C "$root" config --get remote.origin.url 2>/dev/null || true)")"
  if [[ "$slug" != "$PRODUCTION_RELEASE_CANONICAL_SLUG" ]]; then
    blockers+=("origin is '${slug:-unrecognised}', not ${PRODUCTION_RELEASE_CANONICAL_SLUG}; production ships only from the canonical repository")
  elif ! timeout "$PRODUCTION_RELEASE_TIMEOUT" git -C "$root" fetch --quiet origin \
         '+refs/heads/main:refs/remotes/origin/main' </dev/null 2>/dev/null; then
    blockers+=("could not fetch main from ${PRODUCTION_RELEASE_CANONICAL_SLUG}, so whether HEAD is on main cannot be checked; check the network and re-run")
  else
    main="$(git -C "$root" rev-parse refs/remotes/origin/main 2>/dev/null || true)"
    if [[ -z "$head" ]]; then
      blockers+=("HEAD could not be read")
    elif [[ "$head" == "$main" ]]; then
      :
    elif git -C "$root" merge-base --is-ancestor "$head" refs/remotes/origin/main </dev/null 2>/dev/null; then
      warnings+=("HEAD (${head:0:12}) is an earlier commit of main, not its tip (${main:0:12}); this deploy rolls production back to it")
    else
      blockers+=("HEAD (${head:0:12}) is not on main (${main:0:12}); push the change to main, let CI pass, and deploy that commit")
    fi
  fi

  # Every run of the aggregate check on this commit (a push and a pull request can
  # each produce one) must have succeeded, and at least one must exist.
  runs=""
  if [[ -n "$head" && "$slug" == "$PRODUCTION_RELEASE_CANONICAL_SLUG" ]]; then
    runs="$(timeout "$PRODUCTION_RELEASE_TIMEOUT" "$gh_bin" api "repos/${slug}/commits/${head}/check-runs" --paginate \
      --jq ".check_runs[] | select(.name == \"${PRODUCTION_RELEASE_CI_CHECK}\") | (.conclusion // \"in_progress\")" \
      </dev/null 2>/dev/null || true)"
  fi
  if [[ -z "$runs" ]]; then
    blockers+=("the CI check \"${PRODUCTION_RELEASE_CI_CHECK}\" for ${head:0:12} could not be read (gh not signed in, or no run for this commit, such as an unpushed one)")
  elif grep -qvxE 'success|in_progress' <<< "$runs"; then
    blockers+=("the CI check \"${PRODUCTION_RELEASE_CI_CHECK}\" for ${head:0:12} finished red ($(sort -u <<< "$runs" | paste -sd, -)); fix what failed, push, and let CI pass")
  elif grep -qvx 'success' <<< "$runs"; then
    blockers+=("the CI check \"${PRODUCTION_RELEASE_CI_CHECK}\" for ${head:0:12} is not green on every run yet ($(sort -u <<< "$runs" | paste -sd, -)); wait for it to finish green")
  fi

  PRG_BLOCKERS=(${blockers[@]+"${blockers[@]}"})
  PRG_WARNINGS=(${warnings[@]+"${warnings[@]}"})
  return 0
}

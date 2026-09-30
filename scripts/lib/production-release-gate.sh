#!/usr/bin/env bash
# scripts/lib/production-release-gate.sh -- what a tree must prove before it may
# replace what the public is served.
#
# Sourced, never run. Every path that ships code to production calls
# production_release_gate_require before it touches a host: the entry point
# deploy_to_aws.sh, and the leaves it hands off to (scripts/deploy-code.sh, which
# scripts/deploy-migrate.sh execs, and scripts/deploy-rebuild.sh), so a leaf
# reached some other way is held to the same rules. scripts/verify-production-release.sh
# runs the same check on its own, so an operator can ask before starting.
#
# A production release ships only a tree that is proven: committed, on the
# canonical repository's main, passed by CI, passed by the local
# ./run_all_tests.sh --full, already running on staging, and passed there by the
# read-only ./run_all_tests.sh --staging checks, with no verification or safety
# step switched off. Staging is held to none of this on purpose: it is where
# uncommitted work is tried. Every refusal happens before anything is typed,
# built or shipped.
#
# WHAT IT REFUSES, each with the reason and what to do:
#   - SKIP_SMOKE=yes or SKIP_TESTS=yes, which switch off a verification step, and
#     SMOKE_BASE_URL, which would point the post-deploy check at another host;
#   - FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK or FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT, which
#     ship code past the schema-drift check, and FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS,
#     which kills whatever holds the database lock without asking;
#   - a working tree that is not clean, or whose state cannot be read;
#   - an origin other than the canonical repository, so a fork's main and a
#     fork's CI can never stand in for the real ones;
#   - a HEAD that is not the canonical main, fetched explicitly;
#   - a commit whose CI aggregate check ("Type-check and test") is not green on
#     every run of it, including when that cannot be read: an unanswered question
#     is a refusal;
#   - no pass receipt from ./run_all_tests.sh --full for this exact tree (same
#     commit, same fingerprint, clean, same runner), or a receipt this account
#     does not own. --full is a local run and needs no role; the refusal names
#     it, and it is a separate step the operator takes before re-running;
#   - a staging host whose recorded deploy is a different commit, or was shipped
#     from a dirty tree: production promotes what staging has already run;
#   - no pass receipt from ./run_all_tests.sh --staging for the commit staging
#     runs (same commit as staging's own record, same runner), or one this
#     account does not own. The staging checks need the dev-tester role, so the
#     refusal names the dev-tester command.
#
# Every outside call runs non-interactively with a time limit: git never asks for
# a username, ssh never asks for a key passphrase, and an offline machine is a
# refusal rather than a hang.
#
# TEST SEAMS: FOOTBAG_GH_BIN replaces gh; FOOTBAG_SSH_BIN replaces ssh;
# FOOTBAG_FULL_RECEIPT and FOOTBAG_STAGING_RECEIPT name the receipt files. They
# are honoured only when the caller passes --allow-seams (the standalone check,
# which its suite drives) and are refused outright on a deploy, so an exported
# variable can never satisfy the gate that guards production. FOOTBAG_KNOWN_HOSTS
# (ssh-known-hosts.sh) names the pinned host-key file as it does for every deploy.

PRODUCTION_RELEASE_CI_CHECK="Type-check and test"
PRODUCTION_RELEASE_CANONICAL_SLUG="davidleberknight/footbag-platform"
PRODUCTION_RELEASE_TIMEOUT=60

_prg_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/source-tree-state.sh
source "${_prg_lib_dir}/source-tree-state.sh"
# shellcheck source=scripts/lib/full-pass-receipt.sh
source "${_prg_lib_dir}/full-pass-receipt.sh"
# shellcheck source=scripts/lib/staging-deployed-from.sh
source "${_prg_lib_dir}/staging-deployed-from.sh"
PRODUCTION_RELEASE_STAGING_ALIAS="$STAGING_DEPLOYED_FROM_ALIAS"

# _prg_field <file> <key> -- the value of key=value in a receipt.
_prg_field() {
  sed -n "s/^${2}=//p" "$1" 2>/dev/null | head -n 1
}

# _prg_slug <url> -- owner/repo from a GitHub remote URL, or empty.
_prg_slug() {
  printf '%s' "$1" | sed -nE 's#^(git@github\.com:|ssh://git@github\.com/|https://([^@/]+@)?github\.com/)([^/]+/[^/]+)$#\3#p' \
    | sed -E 's#/+$##; s#\.git$##'
}

# production_release_gate_require <repo-root> [--allow-seams]
# Returns 0 when every rule holds; otherwise prints every failing rule with what
# to do about it, and returns 1. Reads only: it changes nothing anywhere, apart
# from fetching the canonical main into this repository's origin/main.
production_release_gate_require() {
  local root="$1" allow_seams=0
  [[ "${2:-}" == "--allow-seams" ]] && allow_seams=1
  local problems=() head main slug receipt staging_receipt status_out staging_commit staging_dirty
  local gh_bin=gh ssh_bin=ssh runs expected_hash
  receipt="$(full_pass_receipt_path)"
  staging_receipt="$(staging_pass_receipt_path)"

  local seam
  for seam in FOOTBAG_GH_BIN FOOTBAG_SSH_BIN FOOTBAG_FULL_RECEIPT FOOTBAG_STAGING_RECEIPT; do
    [[ -n "${!seam:-}" ]] || continue
    if (( allow_seams == 0 )); then
      problems+=("${seam} is set; test seams are refused on a production deploy (unset it)")
    else
      echo "TEST SEAM: ${seam}=${!seam}; this run proves nothing about the real estate." >&2
    fi
  done
  if (( allow_seams == 1 )); then
    gh_bin="${FOOTBAG_GH_BIN:-gh}"
    ssh_bin="${FOOTBAG_SSH_BIN:-ssh}"
    receipt="${FOOTBAG_FULL_RECEIPT:-$receipt}"
    staging_receipt="${FOOTBAG_STAGING_RECEIPT:-$staging_receipt}"
  fi

  echo "==> Production release gate: checking this tree may ship to production ..." >&2
  export GIT_TERMINAL_PROMPT=0
  export GIT_SSH_COMMAND="ssh -o BatchMode=yes"

  [[ "${SKIP_SMOKE:-no}" == "yes" ]] \
    && problems+=("SKIP_SMOKE=yes: a production deploy always verifies staging before and production after; unset it")
  [[ "${SKIP_TESTS:-no}" == "yes" ]] \
    && problems+=("SKIP_TESTS=yes: a production deploy never skips its tests; unset it")
  [[ -n "${SMOKE_BASE_URL:-}" ]] \
    && problems+=("SMOKE_BASE_URL is set: on production the post-deploy check always targets production itself; unset it")
  # Refused whatever value they carry: each one switches off a safety step of the
  # deploy, and an unexpected value is no reason to guess it means "off".
  [[ -n "${FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK:-}" ]] \
    && problems+=("FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK is set: a production deploy never skips the schema-drift check; unset it")
  [[ -n "${FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT:-}" ]] \
    && problems+=("FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT is set: a production deploy never ships code past a schema drift; unset it and resolve the drift")
  [[ -n "${FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS:-}" ]] \
    && problems+=("FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS is set: a production deploy never kills what holds the database lock without asking; unset it")

  if ! status_out="$(git -C "$root" status --porcelain </dev/null 2>/dev/null)"; then
    problems+=("the working tree's state could not be read (git status failed)")
  elif [[ -n "$status_out" ]]; then
    problems+=("the working tree is not clean; production ships only a committed tree (commit or stash, then re-run)")
  fi

  head="$(git -C "$root" rev-parse HEAD 2>/dev/null || true)"
  slug="$(_prg_slug "$(git -C "$root" config --get remote.origin.url 2>/dev/null || true)")"
  if [[ "$slug" != "$PRODUCTION_RELEASE_CANONICAL_SLUG" ]]; then
    problems+=("origin is '${slug:-unrecognised}', not ${PRODUCTION_RELEASE_CANONICAL_SLUG}; production ships only from the canonical repository")
  elif ! timeout "$PRODUCTION_RELEASE_TIMEOUT" git -C "$root" fetch --quiet origin \
         '+refs/heads/main:refs/remotes/origin/main' </dev/null 2>/dev/null; then
    problems+=("could not fetch main from ${PRODUCTION_RELEASE_CANONICAL_SLUG}, so whether HEAD is on main cannot be checked; check the network and re-run")
  else
    main="$(git -C "$root" rev-parse refs/remotes/origin/main 2>/dev/null || true)"
    if [[ -z "$head" || "$head" != "$main" ]]; then
      problems+=("HEAD (${head:0:12}) is not main (${main:0:12}); production ships only what is on main")
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
    problems+=("the CI check \"${PRODUCTION_RELEASE_CI_CHECK}\" for ${head:0:12} could not be read (gh not signed in, or no run for this commit); push, wait for CI, and re-run")
  elif grep -qvx 'success' <<< "$runs"; then
    problems+=("the CI check \"${PRODUCTION_RELEASE_CI_CHECK}\" for ${head:0:12} is not green on every run ($(sort -u <<< "$runs" | paste -sd, -))")
  fi

  local full_cmd="./run_all_tests.sh --full"
  local staging_cmd="scripts/as-dev-tester.sh --account <your-name> ./run_all_tests.sh --quick --staging"
  expected_hash="$(sha256sum "${root}/run_all_tests.sh" 2>/dev/null | cut -d' ' -f1)"
  local tree_now; tree_now="$(source_tree_state "$root")"
  if [[ ! -f "$receipt" ]]; then
    problems+=("no ./run_all_tests.sh --full pass for this tree (no receipt at ${receipt}); run ${full_cmd}, then re-run this deploy")
  elif ! full_pass_receipt_trusted "$receipt"; then
    problems+=("the receipt at ${receipt} is not owned by this account with mode 600; run ${full_cmd}")
  elif [[ "$(_prg_field "$receipt" verdict)" != "GREEN" ]]; then
    problems+=("the --full receipt at ${receipt} is not GREEN; run ${full_cmd}")
  elif [[ "$(_prg_field "$receipt" commit)" != "$head" ]]; then
    problems+=("the last --full pass was for $(_prg_field "$receipt" commit | cut -c1-12), not this commit; run ${full_cmd}")
  elif [[ "$(_prg_field "$receipt" clean)" != "yes" ]]; then
    problems+=("the last --full pass ran on a tree with uncommitted changes; run ${full_cmd} on the clean tree")
  elif [[ -z "$tree_now" || "$(_prg_field "$receipt" tree)" != "$tree_now" ]]; then
    problems+=("the tree has changed since the last --full pass; run ${full_cmd}")
  elif [[ -z "$expected_hash" || "$(_prg_field "$receipt" runner)" != "$expected_hash" ]]; then
    problems+=("the last --full pass was made by a different version of run_all_tests.sh; run ${full_cmd}")
  fi

  # What staging is running, from the record every deploy writes on the host.
  staging_deployed_from_read "$ssh_bin" "$PRODUCTION_RELEASE_TIMEOUT"
  staging_commit="$STAGING_DEPLOYED_COMMIT"
  staging_dirty="$STAGING_DEPLOYED_DIRTY"
  if [[ -z "$staging_commit" ]]; then
    problems+=("could not read what staging is running (/srv/footbag/deployed-from on ${PRODUCTION_RELEASE_STAGING_ALIAS}); check the pinned host keys and the alias")
  elif [[ -z "$head" || "$head" != "$staging_commit"* ]]; then
    problems+=("staging is running ${staging_commit}, not ${head:0:12}; deploy this commit to staging first")
  elif [[ "$staging_dirty" != "0" ]]; then
    problems+=("staging runs ${staging_commit} shipped from a tree with ${staging_dirty} uncommitted path(s); redeploy staging from the clean commit")
  fi

  # The read-only staging checks, passed against the deploy staging runs now. The
  # receipt names the commit exactly as staging's record did when the checks
  # ran, so an older staging pass cannot vouch for a newer deploy. When what
  # staging runs could not be read, the refusal above already stands and there is
  # nothing to match the receipt against.
  if [[ ! -f "$staging_receipt" ]]; then
    problems+=("no ./run_all_tests.sh --staging pass for what staging runs (no receipt at ${staging_receipt}); after deploying this commit to staging, run ${staging_cmd}, then re-run this deploy")
  elif ! full_pass_receipt_trusted "$staging_receipt"; then
    problems+=("the --staging receipt at ${staging_receipt} is not owned by this account with mode 600; run ${staging_cmd}")
  elif [[ "$(_prg_field "$staging_receipt" verdict)" != "GREEN" ]]; then
    problems+=("the --staging receipt at ${staging_receipt} is not GREEN; run ${staging_cmd}")
  elif [[ -n "$staging_commit" && "$(_prg_field "$staging_receipt" commit)" != "$staging_commit" ]]; then
    problems+=("the last --staging pass was for $(_prg_field "$staging_receipt" commit | cut -c1-12), not ${staging_commit}, which staging runs; run ${staging_cmd}")
  elif [[ -z "$expected_hash" || "$(_prg_field "$staging_receipt" runner)" != "$expected_hash" ]]; then
    problems+=("the last --staging pass was made by a different version of run_all_tests.sh; run ${staging_cmd}")
  fi

  if (( ${#problems[@]} > 0 )); then
    echo "ERROR: this tree may not ship to production:" >&2
    printf '  - %s\n' "${problems[@]}" >&2
    return 1
  fi
  echo "==> Production release gate: clean, on main, CI green, --full passed, staging runs it, --staging passed there." >&2
  return 0
}

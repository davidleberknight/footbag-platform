#!/usr/bin/env bash
# run_all_tests.sh — canonical local test runner.
#
# Two local modes, --staging, and the add-on and skip flags listed under Usage:
#
#   ./run_all_tests.sh              The thorough local gate, run before a push and
#       before a staging deploy: every CI gate that is safe on a workstation (the
#       type-checks, lint, convention gate, harness self-check,
#       generated-content check, secret scan, e2e, terraform validation, the
#       security probes against a throwaway local stack, the clean room, which
#       runs the coverage thresholds, the legacy-data pytest suite and the loader
#       gates against what the push would carry), plus the pentest harness, the
#       production-strength password hash, and, where this machine holds the
#       authoritative member load, the real-claim crawl and the real-data
#       invariants against it. It contacts no deployed environment of any kind,
#       and needs no AWS identity. A GREEN run writes the pass receipt the
#       production release gate reads. The report-only checks, the dependency
#       audit (--audit) and the ZAP scan (--zap), run before a production deploy.
#   --quick  The fast pre-commit loop, and exactly what `npm run test:quick`
#       runs: build and test type-check, lint, conventions, harness,
#       generated-content, secret scan, and the unit and integration tiers.
#   --staging  Adds four read-only checks against staging to either mode, and
#       needs the dev-tester role: the staging AWS adapter smoke, the real-data
#       invariants on the staging host, the route smoke against the staging site
#       (GETs only) and the anonymous browser check. It never targets production
#       and never writes to staging. A run whose staging rows all pass writes a
#       staging pass receipt, keyed to the commit staging runs.
#
# Prints a per-gate summary with each gate's elapsed seconds and exits non-zero
# if any gate fails. In the bare run the set of gates matches CI, save for the two
# GitHub-hosted jobs listed below that cannot run here, and the report-only
# dependency audit, which reads the package registry at the moment it runs and
# so runs on request (--audit) before a production deploy.
#
# SAFE BY DESIGN — never touches real data:
#   - It NEVER invokes the loader-pipeline scripts (scripts/reset-local-db.sh,
#     scripts/ci/stage_*.sh) that write into legacy_data/ IN THIS CHECKOUT. The
#     clean-room gate runs the loader inside a throwaway git worktree holding
#     the committed tree plus uncommitted and untracked non-ignored files, where
#     the gitignored real-data trees a maintainer cannot regenerate are simply
#     absent. The safety rule is about what the loader can
#     overwrite, and in that worktree the answer is nothing.
#   - As defense-in-depth it fingerprints legacy_data/ and curated/ before and
#     after the run and ABORTS non-zero if any changed, so a future gate that
#     writes real data fails the run instead of clobbering.
#   The test suites themselves write only to os.tmpdir() / mktemp.
#
# SAFE BY DESIGN — reaches beyond this machine only where it says it does:
#   - Only --staging reaches a deployed environment, and only staging: its
#     preflight asks AWS who the caller is and reads staging's address, host and
#     deployed commit, and its four rows read staging and write nothing there.
#     Every other gate runs through aws_isolated_run
#     (scripts/lib/aws-isolation.sh), which points every credential source at
#     nothing, so a gate that starts reaching AWS fails at once rather than
#     passing wherever a key happens to work. This was trusted rather than
#     enforced until the terraform gate spent months calling STS on every run,
#     green while the operator's key worked and blaming terraform once it
#     stopped. The convention gate holds the staging contact to the staging
#     preflight and the gate_staging_* gates, and refuses any production target.
#
# Two CI jobs have no local counterpart here, and never can:
#   - CodeQL static analysis: GitHub-hosted, and its findings are triaged in the
#     repository's code-scanning view rather than at a terminal.
#   - dependency-review: a GitHub Action over a pull request's dependency diff,
#     with no standalone form; the audit gate here covers the whole tree.
#
# That list is no longer prose anyone has to keep true by hand:
# scripts/ci/check_ci_parity.sh fails the convention gate when the workflow gains
# a job, or a step invoking a command, that has neither a local gate nor a
# recorded reason it cannot have one. The list above drifted before that check
# existed, naming three jobs when there were four. The same check binds
# PUSH_GATE_EQUIVALENTS and QUICK_GATES below to that mapping, so they cannot
# drift apart.
#
# Usage:
#   ./run_all_tests.sh                    # the thorough local gate
#   ./run_all_tests.sh --quick            # the fast pre-commit loop (npm run test:quick)
#   scripts/as-dev-tester.sh --account <you> ./run_all_tests.sh --staging
#                                         # the bare run plus the read-only staging checks
#   ./run_all_tests.sh --plan             # print what a mode would run, and exit
#   ./run_all_tests.sh --help

set -euo pipefail
cd "$(dirname "$0")"

# Credential isolation for the gates that must not reach AWS. Sourced here rather
# than inside a gate so every gate can reach it, and so the conventions gate has
# one place to assert against.
source scripts/lib/aws-isolation.sh

QUICK=0
STAGING=0
PLAN=0
PENTEST=0
ZAP=0
AUDIT=0
WITH_PERSONA_CRAWL=0
WITH_REALDATA_INVARIANTS=0
# The password-hash suite at production argon2 cost. Implied by the bare run only.
WITH_STRONG_HASH=0
# The legacy-mirror suite covers code that is retired at go-live and takes long
# enough to matter, and the push gate never runs it, so no other flag implies it.
WITH_LEGACY_MIRROR=0
# Leaves the secret scan out of a --quick run. The push gate still runs it, so a
# run that used this ends INCOMPLETE rather than passing and says why.
SKIP_SECRET_SCAN=0
# Leaves every Python gate out of the bare run, the clean room's included. The
# push gate still runs them, so the run ends INCOMPLETE and writes no receipt.
SKIP_PY=0
A11Y=0
FAIL_FAST=0
for arg in "$@"; do
  case "$arg" in
    --quick)              QUICK=1 ;;
    --full)
      echo "ERROR: --full is retired. The bare ./run_all_tests.sh is the thorough local gate; run it with no mode." >&2
      exit 1 ;;
    --staging)            STAGING=1 ;;
    --plan)               PLAN=1 ;;
    --with-persona-crawl) WITH_PERSONA_CRAWL=1 ;;
    --with-realdata-invariants) WITH_REALDATA_INVARIANTS=1 ;;
    --with-legacy-mirror) WITH_LEGACY_MIRROR=1 ;;
    --skip-secret-scan)   SKIP_SECRET_SCAN=1 ;;
    --skip-py)            SKIP_PY=1 ;;
    --a11y)              A11Y=1 ;;
    --pentest)            PENTEST=1 ;;
    --zap)                ZAP=1; PENTEST=1 ;;
    --audit)              AUDIT=1 ;;
    --fail-fast)          FAIL_FAST=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./run_all_tests.sh [--quick] [--staging] [--plan] [--fail-fast]
                          [--with-persona-crawl] [--with-realdata-invariants]
                          [--with-legacy-mirror] [--a11y] [--pentest] [--zap] [--audit]
                          [--skip-secret-scan] [--skip-py]

Canonical local test runner. Runs the CI gates that are safe on a workstation
and summarizes the results, with each gate's elapsed seconds.

Modes:
  (no mode)     The thorough local gate, before a push and before a staging
                deploy. Every CI gate that is safe on a workstation: build and
                test type-check, lint, conventions, the harness self-check, generated-content, the
                secret scan, e2e (it takes ports 3000 and 4001), terraform
                validation, the blocking security probes against a throwaway
                local stack, and the clean room, which rebuilds the tree in a
                throwaway worktree and runs the suite as the push gate sees it
                (the coverage thresholds, the loader gates and the legacy
                Python suite included). Plus the pentest harness, the a11y scan
                (carried by e2e), the production-strength password hash, and the
                real-claim crawl and real-data invariants against the local
                database when it holds the authoritative member load; without
                that load those two rows report "not required" and do not hold
                the run back. Contacts no deployed environment and needs no AWS
                identity. Before any gate it checks the tools it needs and
                refuses, naming what is missing. Each test runs once: build,
                lint, conventions, generated-content and the unit and
                integration tiers run in the clean room. A GREEN run writes a
                pass receipt the production release gate reads.
  --quick       The fast pre-commit loop, and exactly what npm run test:quick
                runs: build and test type-check, lint, conventions, harness,
                generated-content, the secret scan (passing when no scanner is
                installed), and the unit and integration tiers. Ends with success
                when all of that passed, naming what only the bare run runs.

Switches:
  --staging     Adds four read-only rows against staging to either mode, run
                through the dev-tester role (scripts/as-dev-tester.sh):
                  staging-aws-smoke            the staging AWS adapter smoke
                  staging-realdata-invariants  the whole-population invariants on
                                               the staging host (counts and
                                               PASS/FAIL only)
                  staging-route-smoke          GETs against the staging site
                  staging-browser              the anonymous browser check
                They run first, right after a preflight that finds any missing
                role, wiring or site at minute 0; a row whose needs are missing
                FAILs without running and names the fix, and the local gates
                still run. Never production, and nothing written to staging. A
                run whose staging rows all pass writes a staging pass receipt
                keyed to the commit staging runs; a staging failure exits
                non-zero but never voids the local receipt.
  --plan        Print each row this run would schedule and where it points, then
                exit before anything else happens.
  --fail-fast   Stop at the first failing gate instead of running them all.

Additions to --quick (each is already part of the bare run):
  --with-persona-crawl
                The real-claim crawl: builds a claimed account for a real
                migrated record through /dev/build-claim and crawls its surfaces,
                against a dev stack the gate boots on this machine (stopping
                anything on ports 3000 and 4001) over the database it serves,
                FOOTBAG_DB_PATH or database/footbag.db. PERSONA_CRAWL_BASE_URL may
                name another loopback address; anything else is refused.
                PERSONA_CRAWL_LEGACY_ID targets a record. Needs the authoritative
                member load; without it the row reports "not required".
  --with-realdata-invariants
                Read-only, PII-safe whole-population invariants over the local
                authoritative load: reconciliation and field gates plus
                referential integrity. Output is counts and PASS/FAIL only.
                Without the load the row reports "not required"; --staging runs
                the same checks against staging's copy.
  --a11y        The axe WCAG 2.1 AA scan of the high-traffic public pages, on
                its own throwaway browser stack (in the bare run, e2e carries it).
  --pentest     The heavyweight pentest harness (npm run test:pentest:heavy):
                boots a throwaway stack and runs its blocking probes. It leaves
                out the ZAP scan unless --zap is also given.
  --zap         The OWASP ZAP scan of the local stack, added to the pentest
                harness (implies --pentest). Report-only, long and Docker-based,
                so no mode implies it: run it before a production deploy.
  --audit       The dependency audit (npm run audit). Report-only: an advisory
                warns and never fails the run, and CI reports it on every push,
                so no mode implies it: run it before a production deploy.
  --skip-secret-scan
                Leave the secret scan out of a --quick run. The push gate still
                runs it, so the run ends INCOMPLETE and names it.

Subtractions from the bare run:
  --skip-py     Leave out every gate that runs the legacy-data and freestyle
                pipelines' Python, all of it pre-go-live migration tooling, in
                the checkout and in the clean room: the Python-driven integration
                suite, the generated-content guard, the loader gate, the
                freestyle database guards and the legacy-data pytest suite. No
                Python environment is built. The push gate still runs them, so
                the run ends INCOMPLETE, names them NOT RUN and writes no pass
                receipt. Cannot be combined with --quick or --with-legacy-mirror.

Run only by name, in any mode:
  --with-legacy-mirror
                The legacy-mirror Python suite (legacy_data/legacy_mirror/tests/).
                Its code is retired at go-live and the push gate never runs it.

SAFE BY DESIGN: this runner never writes to legacy_data/ or curated/. The loader
gate runs only inside the clean room's throwaway worktree, which holds what the
next push would carry and nothing a maintainer cannot regenerate, and this
runner fingerprints the real-data trees before/after to prove nothing changed.

Not run here:
  - CodeQL static analysis and the pull-request dependency review: GitHub-hosted,
    with no local form.
  - Anything against production. The browser check after a production deploy is
    the operator's: npm run test:deployed -- --target production.
USAGE
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

# The bare command is the thorough local gate, and the fast loop is the one a
# reader has to ask for. --staging adds to either mode and implies neither.
if (( QUICK == 0 && SKIP_SECRET_SCAN == 1 )); then
  echo "ERROR: --skip-secret-scan is a --quick switch: the bare run is the whole gate." >&2
  exit 1
fi
if (( SKIP_PY == 1 && (QUICK == 1 || WITH_LEGACY_MIRROR == 1) )); then
  echo "ERROR: --skip-py is a switch of the bare run, and cannot be combined with --quick or --with-legacy-mirror." >&2
  exit 1
fi
FULL=$(( QUICK == 0 ? 1 : 0 ))

# The bare run implies these; the staging rows are never among them.
if (( FULL == 1 )); then
  PENTEST=1
  A11Y=1
  WITH_PERSONA_CRAWL=1
  WITH_REALDATA_INVARIANTS=1
  WITH_STRONG_HASH=1
fi

# The environment each staging row is pinned to, assigned rather than read, so a
# value exported in the operator's shell can never move a staging row elsewhere.
STAGING_SMOKE_TARGET_ENV=staging
STAGING_ROUTE_SMOKE_ENV=staging
STAGING_BROWSER_TARGET=staging

mode_label() {
  printf '%s%s' "$( (( FULL == 1 )) && echo full || echo quick)" "$( (( STAGING == 1 )) && echo +staging || true)"
}

# -----------------------------------------------------------------------------
# What each mode schedules. Declared before anything touches the machine, so
# --plan can print it and stop.
# -----------------------------------------------------------------------------

# A gate that could not run has not passed, and a run carrying one cannot promise
# what a reader takes "all gates passed" to mean. Saying so is the difference
# between knowing this tree is good and knowing only that nothing objected.
#
# Only a gate that stands for a push-gate job can change that promise, though.
# The operator-only and real-data gates skip on any machine without the operator
# dataset, and the push gate never runs them either, so counting those would make
# a clean verdict unreachable and teach the reader to ignore it. They are
# reported, not held against the run.
PUSH_GATE_EQUIVALENTS="build lint conventions harness generated-content secret-scan unit integration e2e terraform security-probes clean-room"

# The fast pre-commit loop, and its one home: `npm run test:quick` is
# `./run_all_tests.sh --quick`, and check_ci_parity.sh binds this list to the
# workflow jobs the fast loop claims to carry.
QUICK_GATES="build lint conventions harness generated-content secret-scan unit integration"

# The real-data rows. Without the authoritative load on this machine they are
# not required, and their skip does not void the pass receipt.
REALDATA_ROWS="persona-crawl realdata-invariants"

# Each test runs once. In the bare run the clean room runs these against exactly what
# the next push would carry, in the runner's own conditions, so the checkout does
# not run them a second time. The unit and integration tiers run there once, as
# the coverage run. Everything that needs this machine stays in the checkout.
ROOM_CARRIES_UNDER_FULL="build lint conventions generated-content unit integration"

room_carries() {
  (( FULL == 1 )) && [[ " ${ROOM_CARRIES_UNDER_FULL} " == *" $1 "* ]]
}

# in_mode <gate> — whether this mode schedules a base gate: all of them in the
# bare run, the quick set under --quick.
in_mode() {
  (( FULL == 1 )) || [[ " ${QUICK_GATES} " == *" $1 "* ]]
}

# Where a row points, for --plan. Every row not named here runs on this machine.
gate_target() {
  case "$1" in
    staging-aws-smoke)           echo "staging (the staging AWS account, test:smoke --target ${STAGING_SMOKE_TARGET_ENV})" ;;
    staging-realdata-invariants) echo "staging (the staging host's database, read-only)" ;;
    staging-route-smoke)         echo "staging (GETs against the staging site, SMOKE_ENV=${STAGING_ROUTE_SMOKE_ENV})" ;;
    staging-browser)             echo "staging (anonymous pages, test-deployed.sh --target ${STAGING_BROWSER_TARGET})" ;;
    clean-room)                  if (( SKIP_PY == 1 )); then echo "local (a throwaway worktree, its Python gates left out by --skip-py)"; else echo "local (a throwaway worktree)"; fi ;;
    *)                           if room_carries "$1"; then echo "local (clean room)"; else echo "local"; fi ;;
  esac
}

# The staging rows run first, straight after their preflight: they are quick,
# they do not depend on this tree's build, and they then test the deploy the
# preflight saw rather than whatever staging runs an hour later.
staging_sequence() {
  run_gate staging-aws-smoke           gate_staging_aws_smoke
  run_gate staging-realdata-invariants gate_staging_realdata_invariants
  run_gate staging-route-smoke         gate_staging_route_smoke
  run_gate staging-browser             gate_staging_browser
}

# =============================================================================
# THE LOCAL GATE SEQUENCE — ADD NEW SUITES HERE.
# Each line is one gate: `run_gate <label> <command...>`, or `checkout_gate` for
# one the clean room carries in the bare run. To extend coverage as new test suites
# land, add a line (or a gate_* function below for compound gates) in the right
# place. Keep every gate SAFE: it must write only to os.tmpdir()/mktemp, never
# to legacy_data/ or curated/, and reach nothing beyond this machine.
# =============================================================================
local_sequence() {
  # The build type-checks src/ only; the tests' type-check rides in the same
  # gate, as it does in the push gate's type-check job.
  if in_mode build; then
    checkout_gate build       bash -c 'npm run build && npm run typecheck:tests'
  fi
  if in_mode lint; then
    checkout_gate lint        npm run lint
  fi
  if (( AUDIT == 1 )); then
    run_gate audit       gate_audit
  fi
  if in_mode conventions; then
    checkout_gate conventions bash scripts/ci/assert_conventions.sh
  fi
  # The harness self-check's one machine-local check reads the gitignored
  # per-developer settings file, which the clean room cannot see, so in the bare run
  # the checkout still runs it, leaving the hook fixture suite to the room.
  if (( FULL == 1 )); then
    run_gate harness-local bash scripts/ci/assert_claude_harness.sh --skip-hook-fixtures
  elif in_mode harness; then
    run_gate harness     bash scripts/ci/assert_claude_harness.sh
  fi
  if in_mode generated-content; then
    checkout_gate generated-content bash scripts/ci/assert_generated_content_current.sh
  fi
  if (( SKIP_SECRET_SCAN == 1 )); then
    note_gate secret-scan "SKIP (left out by --skip-secret-scan; the push gate still runs it)"
  elif in_mode secret-scan; then
    run_gate secret-scan gate_secret_scan
  fi
  if in_mode unit; then
    checkout_gate unit        npm run test:unit
  fi
  if in_mode integration; then
    checkout_gate integration npm run test:integration
  fi
  if in_mode e2e; then
    run_gate e2e        gate_e2e
  fi
  if in_mode terraform; then
    run_gate terraform  gate_terraform
  fi

  if (( WITH_PERSONA_CRAWL == 1 )); then
    run_gate persona-crawl gate_persona_crawl
  fi

  if (( WITH_REALDATA_INVARIANTS == 1 )); then
    run_gate realdata-invariants gate_realdata_invariants
  fi

  # The password-hash suite at the cost production pays. Every other run uses
  # the cheap test profile, so this is the only pass over the production
  # parameters.
  if (( WITH_STRONG_HASH == 1 )); then
    run_gate strong-hash npm run test:strong-hash
  fi

  # The e2e gate runs every Playwright spec, the @a11y ones included, so wherever
  # it ran the a11y gate would only repeat them. It runs on its own only where
  # e2e did not, which is --quick --a11y.
  if (( A11Y == 1 )); then
    if (( QUICK == 0 )); then
      note_gate a11y "COVERED (the e2e gate ran the @a11y specs)"
    else
      run_gate a11y       gate_a11y
    fi
  fi

  if (( PENTEST == 1 )); then
    run_gate pentest    gate_pentest
  fi

  # The security probes mirror their CI job and boot a second throwaway stack.
  if in_mode security-probes; then
    run_gate security-probes gate_security_probes
  fi

  if (( WITH_LEGACY_MIRROR == 1 )); then
    run_gate legacy-mirror gate_legacy_mirror
  fi

  # The loader pipeline is absent from THIS runner for the reason it always was:
  # it writes legacy_data fixtures and is safe only where there is nothing real
  # to overwrite. The clean-room gate runs it inside a throwaway worktree holding
  # what the next push would carry and none of the gitignored real-data trees,
  # which is the same condition the runner checks out into. It installs from the
  # lockfile and re-runs the suite, so it is the longest gate, and it also runs
  # the coverage thresholds and the legacy-data pytest suite as the push gate
  # runs them.
  if in_mode clean-room; then
    local room_args=()
    (( SKIP_PY == 1 )) && room_args+=(--skip-py)
    run_gate clean-room bash scripts/ci/run_clean_room.sh --results "$CLEAN_ROOM_RESULTS" ${room_args[@]+"${room_args[@]}"}
  fi
}

# --plan: every row this mode would schedule and where it points, printed before
# anything else happens — no hook install, no artifact sweep, no preflight, no
# log directory touched — so a reader, and the suite, can see what a run would do
# without running it.
if (( PLAN == 1 )); then
  run_gate()      { printf '  %-28s %s\n' "$1" "$(gate_target "$1")"; }
  checkout_gate() { run_gate "$1"; }
  note_gate()     { printf '  %-28s %s\n' "$1" "local (not a gate of its own: $2)"; }
  CLEAN_ROOM_RESULTS=""
  echo "→ run_all_tests.sh --plan (mode: $(mode_label)). Each row this run would schedule, and where it points. Nothing has run."
  if (( STAGING == 1 )); then staging_sequence; fi
  local_sequence
  exit 0
fi

# Preflight: required tooling. Match deploy_to_aws.sh's need_cmd shape.
need_cmd() {
  local cmd="$1" pkg_hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $cmd" >&2
    echo "Recommendation: $pkg_hint" >&2
    exit 1
  fi
}
need_cmd node "Run bash scripts/setup-dev-workstation.sh (installs Node at the .nvmrc version)."
need_cmd npm  "Run bash scripts/setup-dev-workstation.sh (npm ships with Node)."
# Judged against the lockfile, not by node_modules existing: a tree installed
# before a dependency was added or moved exists and is still wrong.
source scripts/lib/npm-deps.sh
if ! npm_deps_current "$PWD"; then
  echo "ERROR: node_modules/ does not hold the versions package-lock.json pins." >&2
  echo "Recommendation: run 'npm ci' first." >&2
  exit 1
fi

# Activate the repository's git hooks. npm does this on install, but a checkout
# whose dependencies were installed before that existed never re-runs it, and an
# inactive commit hook is silent: commits simply go unscanned. Idempotent.
bash scripts/install-git-hooks.sh

# Every gate's full output, and the preflight's, kept after the run. Outside the
# temporary directory the exit trap removes, because the report at the end is a
# selection and the full log is the only thing that can answer why a gate failed;
# a path to a deleted file answers nothing. One run's worth: emptied at the start
# of each run, so it never grows. The clean room keeps its own logs the same way.
GATE_LOG_DIR="${TMPDIR:-/tmp}/footbag-run-all-last"
rm -rf "$GATE_LOG_DIR"
mkdir -p "$GATE_LOG_DIR"
PREFLIGHT_LOG="${GATE_LOG_DIR}/preflight.log"
# Where the clean room writes one line per gate it ran, so each gets its own row.
CLEAN_ROOM_RESULTS="${GATE_LOG_DIR}/clean-room-results.tsv"

# Every tool the gates below reach for, reported before any of them runs, so a
# missing one is named here rather than discovered as a skip an hour in. Also
# kept, so the problems it names reappear in the notices at the end.
# shellcheck source=scripts/lib/tool-report.sh
source scripts/lib/tool-report.sh
tool_report node python python3 sqlite3 ffmpeg ffprobe jq age docker gitleaks terraform 2>&1 | tee "$PREFLIGHT_LOG"

# The legacy pipeline's Python environment, which the integration suite and the
# pytest gate run under. Reported, never built: it lives inside legacy_data/, and
# this runner writes nothing there. The dev launcher and the workstation setup
# script build it, through the pipeline, which is its only builder.
if (( SKIP_PY == 0 )) && ! (source scripts/lib/python-env.sh && footbag_python pipeline fail) >/dev/null 2>&1; then
  {
    echo "WARNING: the legacy pipeline's Python environment is missing, so the legacy-extractor"
    echo "         integration suite fails and the pytest gate skips. Build it with:"
    echo "           bash legacy_data/run_pipeline.sh venv"
  } | tee -a "$PREFLIGHT_LOG" >&2
fi

# -----------------------------------------------------------------------------
# Where the real-data rows (the real-claim crawl and the invariants) read the real
# dataset from: this machine's own authoritative load, or nowhere. The footbag.org
# member data is not to be copied onto a workstation, so most machines answer
# "none", and on those the two rows report that they are not required rather
# than reaching for a copy elsewhere. Staging's copy is checked by --staging, and
# only there.
#
# Local qualifies on three counts, never a name: at least 200 legacy_members
# (fixtures carry a handful, the real dump thousands), at least one row the
# footbag.org export itself wrote (a mirror-only seed has none), and at least
# one claimable Hall-of-Fame record for the crawl to target. Cached in
# REALDATA_SOURCE and printed once, so the run says which dataset it proved.
# -----------------------------------------------------------------------------
REALDATA_SOURCE=""
realdata_source() {
  [[ -n "$REALDATA_SOURCE" ]] && return 0
  local db="${FOOTBAG_DB_PATH:-./database/footbag.db}"
  local members=0 authoritative=0 claimable=0
  if [[ -f "$db" ]] && command -v sqlite3 >/dev/null 2>&1; then
    members=$(sqlite3 -readonly "$db" "SELECT COUNT(*) FROM legacy_members;" 2>/dev/null || echo 0)
    authoritative=$(sqlite3 -readonly "$db" "SELECT COUNT(*) FROM legacy_members WHERE import_source='legacy_site_data';" 2>/dev/null || echo 0)
    claimable=$(sqlite3 -readonly "$db" "SELECT COUNT(*) FROM historical_persons WHERE hof_member=1 AND legacy_member_id IS NOT NULL;" 2>/dev/null || echo 0)
  fi
  members=${members//[^0-9]/}; authoritative=${authoritative//[^0-9]/}; claimable=${claimable//[^0-9]/}
  if (( ${members:-0} >= 200 && ${authoritative:-0} > 0 && ${claimable:-0} > 0 )); then
    REALDATA_SOURCE=local
    echo "→ real-data source: local (the authoritative load at ${db})"
  else
    REALDATA_SOURCE=none
    echo "→ real-data source: none (no authoritative load at ${db}); the real-data rows are not required here, and --staging checks staging's copy read-only"
  fi
}

# One RDI_<key> value out of a probe reply, digits only.
realdata_probe_value() {
  local v
  v="$(printf '%s\n' "$1" | grep -E "^$2=" | tail -1 | cut -d= -f2-)"
  printf '%s' "${v//[^0-9]/}"
}

# -----------------------------------------------------------------------------
# The bare run's preflight. The tools a gate cannot work without, checked before the
# first gate, so a missing one is named now rather than as a failure forty
# minutes in. Only a real need refuses the run: a tool whose gate already copes
# without it is not checked here (the secret scan falls back to the pinned
# container or warns, the terraform gate and the pentest's ZAP leg skip, the
# audit warns on an unreachable registry), and that gate's SKIP row withholds the
# receipt instead. It asks no deployed environment anything and needs no AWS
# identity.
# -----------------------------------------------------------------------------
full_preflight() {
  local problems=() tool
  for tool in sqlite3 curl; do
    command -v "$tool" >/dev/null 2>&1 || problems+=("${tool} is not installed; bash scripts/setup-dev-workstation.sh reports how to install it")
  done

  if (( ${#problems[@]} > 0 )); then
    echo "" >&2
    echo "ERROR: the bare run cannot run on this machine as it stands. Nothing has run yet." >&2
    printf '  - %s\n' "${problems[@]}" >&2
    return 1
  fi
  echo "→ preflight: the tools every local gate needs are present; real-data source: ${REALDATA_SOURCE:-not needed}."
}

# -----------------------------------------------------------------------------
# --staging preflight. What each staging row needs, found at minute 0. A row whose
# needs are missing is recorded here with the fix, and FAILs without running when
# its turn comes, so a missing role or an unreachable site is named at the start,
# never as a raw error mid-run, and the local gates still run. Every value that
# comes back from staging is a count, an address or a commit, never a name.
# -----------------------------------------------------------------------------
declare -A STAGING_BLOCKERS=()
STAGING_URL=""
STAGING_DEPLOYED_COMMIT=""
STAGING_DEPLOYED_DIRTY=""

# staging_block <message> <row>... — the named rows will fail without running.
staging_block() {
  local msg="$1" row
  shift
  for row in "$@"; do
    STAGING_BLOCKERS[$row]+="  - ${msg}"$'\n'
  done
  echo "  - ${msg} (blocks: $*)"
}

# staging_blocked <row> — true, having said why, when the preflight blocked it.
staging_blocked() {
  local row="$1"
  [[ -n "${STAGING_BLOCKERS[$row]:-}" ]] || return 1
  echo "ERROR: ${row} did not run: its --staging preflight found what it needs missing:" >&2
  printf '%s' "${STAGING_BLOCKERS[$row]}" >&2
  return 0
}

staging_preflight() {
  local all=(staging-aws-smoke staging-realdata-invariants staging-route-smoke staging-browser)
  local fix_role="run it through the dev-tester switch: scripts/as-dev-tester.sh --account <your-name> ./run_all_tests.sh --staging (onboarding: scripts/accept-dev-tester-onboarding.sh)"
  local fix_wire="the staging alias must connect as your own account (run through scripts/as-dev-tester.sh --account <your-name>), ~/AWS/HOST_OPERATOR.txt must hold your staging sudo password at mode 600, and the alias and its pinned host key come from scripts/accept-dev-tester-onboarding.sh"
  local arn probe members authoritative claimable site ssh_bin

  echo "→ --staging preflight: checking what the staging rows need ..."
  if ! command -v aws >/dev/null 2>&1; then
    staging_block "the AWS CLI is not installed; bash scripts/setup-dev-workstation.sh --operator installs it" "${all[@]}"
  else
    # An AWS fact, not a profile name found in a file: the caller must be a
    # session of the dev-tester job role, and the staging runtime identity the
    # smoke suite probes through must answer.
    arn=$(aws sts get-caller-identity --query Arn --output text 2>/dev/null || true)
    if [[ "$arn" != *":assumed-role/FootbagDevTester/"* ]]; then
      staging_block "--staging requires the dev-tester role, and this shell is ${arn:-not signed in to AWS}; ${fix_role}" "${all[@]}"
    elif ! aws sts get-caller-identity --profile footbag-staging-runtime >/dev/null 2>&1; then
      staging_block "the staging runtime identity (profile footbag-staging-runtime) does not answer; re-run scripts/accept-dev-tester-onboarding.sh" staging-aws-smoke
    fi
  fi

  [[ -d terraform/staging/.terraform ]] \
    || staging_block "terraform/staging is not initialised; the staging smoke reads its outputs (run terraform init there, as the dev-tester)" \
         staging-aws-smoke

  # Staging's address is the one the staging host records it serves, asked of
  # the host once it confirms it is staging. In a subshell so the shared
  # library's assignments stay out of the runner's own shell.
  site="$( (
    # shellcheck source=scripts/lib/host-env-remote.sh
    source scripts/lib/host-env-remote.sh
    host_address_for staging >/dev/null 2>&1 && printf '%s' "$HOST_ADDRESS"
  ) || true)"
  if [[ -z "$site" ]]; then
    staging_block "the staging site address could not be read from the staging host; ${fix_wire}" \
      staging-route-smoke staging-browser
  elif ! curl -fsS -o /dev/null --max-time 15 "${site}/health/ready" 2>/dev/null; then
    staging_block "the staging site at ${site} does not answer its readiness check; deploy staging or wait for it to come up" \
      staging-route-smoke staging-browser
  else
    STAGING_URL="$site"
  fi

  # Staging's dataset, which the invariants row reads on the host: counts only.
  if ! probe="$(bash scripts/realdata-staging.sh probe)"; then
    staging_block "staging's database could not be reached on the staging host; ${fix_wire}" staging-realdata-invariants
  else
    members="$(realdata_probe_value "$probe" RDI_MEMBERS)"
    authoritative="$(realdata_probe_value "$probe" RDI_AUTHORITATIVE)"
    claimable="$(realdata_probe_value "$probe" RDI_CLAIMABLE)"
    if (( ${members:-0} < 200 || ${authoritative:-0} == 0 || ${claimable:-0} == 0 )); then
      staging_block "staging's database carries no authoritative real dataset (${members:-0} legacy_members, ${authoritative:-0} from the footbag.org export, ${claimable:-0} claimable Hall-of-Fame records); an operator's staging deploy with --all-data loads it" \
        staging-realdata-invariants
    fi
  fi

  # What staging runs: the commit a green run's pass receipt is keyed to, read the
  # way the production release gate reads it. The test seam replaces the ssh
  # client and says so, because a stubbed read proves nothing about staging.
  # shellcheck source=scripts/lib/staging-deployed-from.sh
  source scripts/lib/staging-deployed-from.sh
  ssh_bin="${FOOTBAG_SSH_BIN:-ssh}"
  if [[ -n "${FOOTBAG_SSH_BIN:-}" ]]; then
    echo "TEST SEAM: FOOTBAG_SSH_BIN=${FOOTBAG_SSH_BIN}; what staging runs was not read from the staging host." >&2
  fi
  staging_deployed_from_read "$ssh_bin"
  if [[ -z "$STAGING_DEPLOYED_COMMIT" ]]; then
    echo "  WARNING: what staging runs (/srv/footbag/deployed-from) could not be read; the staging rows still run, but a green run writes no staging pass receipt. Check the pinned host keys and the alias."
  fi

  if (( ${#STAGING_BLOCKERS[@]} > 0 )); then
    echo "→ --staging preflight: the rows named above will FAIL without running; the local gates still run."
  else
    echo "→ --staging preflight: dev-tester identity, staging wiring, site and dataset all present; staging runs ${STAGING_DEPLOYED_COMMIT:-an unreadable commit}."
  fi
}

# Decided once, here in the runner's own shell, because every gate runs in a
# subshell and a choice made inside one would be made again in the next.
if (( WITH_PERSONA_CRAWL == 1 || WITH_REALDATA_INVARIANTS == 1 )); then
  realdata_source
fi
if (( FULL == 1 )); then
  full_preflight 2>&1 | tee -a "$PREFLIGHT_LOG"
  (( PIPESTATUS[0] == 0 )) || exit 1
fi
# In this shell rather than a pipeline, so what it records reaches the gates; its
# output is shown and kept once it finishes.
if (( STAGING == 1 )); then
  staging_preflight > "${GATE_LOG_DIR}/staging-preflight.log" 2>&1 || true
  tee -a "$PREFLIGHT_LOG" < "${GATE_LOG_DIR}/staging-preflight.log"
fi

# Start from a clean slate: sweep the previous run's transient test/build
# artifacts before this run begins. Deliberately at the START, not the end, so
# this run's Playwright retain-on-failure traces survive for post-run debugging.
# clean_up_rubbish.sh touches no real-data tree, so it runs before the
# fingerprint snapshot below.
#
# --stale-only because this sweep is automatic and a second run is something an
# operator starts deliberately: the temp databases in the sweep's path belong to
# whatever is running right now, in this terminal or another one, and deleting
# them mid-suite fails the other run somewhere far from the cause. The flag
# spares anything young enough to still be in use; a later sweep collects it.
bash scripts/clean_up_rubbish.sh --stale-only

# -----------------------------------------------------------------------------
# No-real-data guard. Fingerprint the trees that hold irreplaceable local data.
# Python bytecode caches (__pycache__, *.pyc, .pytest_cache) are regenerable build
# artifacts, not real data, so they are pruned from the fingerprint. A stray
# bytecode write from any pytest invocation, including an ad-hoc manual run, can
# then never masquerade as a real-data change, while a genuine write to a data
# file still trips the guard.
# The find segment tolerates its own non-zero exit (broken symlinks etc.) so a
# fingerprint is always produced under 'set -o pipefail'.
# -----------------------------------------------------------------------------
REAL_DATA_DIRS=(legacy_data curated)
fingerprint() {
  local dir="$1"
  if [[ -e "$dir" ]]; then
    { find "$dir" \( -name '__pycache__' -o -name '.pytest_cache' \) -prune -o -name '*.pyc' -prune -o -printf '%T@ %s %p\n' 2>/dev/null || true; } | LC_ALL=C sort | sha256sum | awk '{print $1}'
  else
    echo "absent"
  fi
}
declare -A FP_BEFORE=()
for d in "${REAL_DATA_DIRS[@]}"; do FP_BEFORE["$d"]=$(fingerprint "$d"); done

# -----------------------------------------------------------------------------
# One-tree guard. A verdict is about a tree, and this run has to be about one.
#
# The gates here read the live checkout; the clean-room gate snapshots it when
# its own turn starts, an hour in. So a tree edited while the run is in flight
# is not one subject with several opinions, it is several subjects, and the
# summary presents the last one as though it spoke for all of them. That is not
# hypothetical: one run reported on at least three trees, and the convention
# gate it declared failed passed cleanly against the tree the reader was looking
# at by the time they read it. An hour was spent on the difference.
#
# Asked of git rather than of the filesystem, and by content rather than by
# modification time: what is compared is the commit this tree would produce.
# Saving a file without changing it is not a different subject. Build output and
# anything else ignored is excluded for the same reason, so a gate writing into
# dist/ or a coverage directory cannot void its own run.
# -----------------------------------------------------------------------------
# shellcheck source=scripts/lib/source-tree-state.sh
source scripts/lib/source-tree-state.sh
SOURCE_TREE_BEFORE="$(source_tree_state)"
# shellcheck source=scripts/lib/full-pass-receipt.sh
source scripts/lib/full-pass-receipt.sh
# A run removes any earlier receipt it could write before it starts, so only a
# run that ends passing can leave one behind.
if (( FULL == 1 )); then rm -f "$(full_pass_receipt_path)"; fi
if (( STAGING == 1 )); then rm -f "$(staging_pass_receipt_path)"; fi
SOURCE_TREE_LIST_BEFORE="$(git status --porcelain 2>/dev/null || true)"

# The content hash of every file that differs from the commit, tracked or not, so
# the VOID report can name a file that was already modified when the run started
# and changed again: its status line reads the same before and after.
changed_file_hashes() {
  { git diff --name-only -z HEAD 2>/dev/null; git ls-files --others --exclude-standard -z 2>/dev/null; } \
    | xargs -0 -r sha256sum 2>/dev/null | sort -k2 || true
}
SOURCE_TREE_FILES_BEFORE="$(changed_file_hashes)"

assert_source_tree_unchanged() {
  local now
  now="$(source_tree_state)"
  [[ "$now" == "$SOURCE_TREE_BEFORE" ]] && return 0

  echo "" >&2
  echo "==============================================" >&2
  echo " VERDICT VOID: the tree changed while this run was in flight" >&2
  echo "==============================================" >&2
  echo "  Not every gate above read the same source, so together they describe" >&2
  echo "  no single commit and cannot tell you whether a push will pass. The" >&2
  echo "  individual results are still true of whatever each gate happened to" >&2
  echo "  read; the verdict over them is not." >&2
  echo "" >&2
  echo "  What differs, start of run against now:" >&2
  local changed
  changed="$(diff <(printf '%s\n' "$SOURCE_TREE_FILES_BEFORE") <(changed_file_hashes) \
    | sed -nE 's/^[<>] [0-9a-f]{64}  //p' | sort -u || true)"
  if [[ -n "$changed" ]]; then
    sed 's/^/    /' <<< "$changed" >&2
  else
    echo "    no file's content differs; the commit itself moved" >&2
  fi
  echo "" >&2
  echo "  A file whose content came back to where it started is not reported" >&2
  echo "  here and does not void the run. Re-run with the tree held still." >&2
  return 1
}

assert_real_data_untouched() {
  local changed=0 d now
  for d in "${REAL_DATA_DIRS[@]}"; do
    now=$(fingerprint "$d")
    if [[ "$now" != "${FP_BEFORE[$d]}" ]]; then
      echo "FATAL: '$d/' (real-data tree) changed during this run." >&2
      changed=1
    fi
  done
  if (( changed == 1 )); then
    # Deliberately does not claim a gate did it. The fingerprint sees any writer,
    # and the tree has other legitimate ones: a legacy mirror crawl rewrites
    # mirror files for hours at a time, and a run overlapping one will trip this
    # every time while every gate behaved. Naming a cause the check cannot
    # actually observe sends the reader hunting a test bug that may not exist,
    # and a guard that cries wolf is a guard people learn to skip.
    echo "FATAL: run_all_tests.sh detected a write into a real-data tree. Investigate before trusting this run." >&2
    echo "  A gate may have written, which would be a serious bug. Check first whether another" >&2
    echo "  process was writing concurrently (a mirror crawl, a pipeline run, an editor):" >&2
    echo "    ps -eo pid,etimes,cmd | grep -i mirror" >&2
    echo "  and whether any tracked file actually changed:" >&2
    echo "    git status --short legacy_data/ curated/" >&2
    exit 2
  fi
}

# -----------------------------------------------------------------------------
# Gate runner + result tracking.
# -----------------------------------------------------------------------------
GATE_NAMES=()
GATE_RESULTS=()
FAIL_LOGS=()
ANY_FAIL=0
# Kept apart because they decide different things: a local failure withholds the
# local receipt, a staging failure only the staging one. Either fails the run.
LOCAL_ANY_FAIL=0
STAGING_ANY_FAIL=0

# Scratch space a gate needs only while it runs (Terraform data directories, the
# persona stack's log, pytest's bytecode). In the OS tmpdir, never a real-data
# tree, and removed on exit. Gate output is not kept here: it goes to
# GATE_LOG_DIR, which outlives the run.
LOG_DIR=$(mktemp -d "${TMPDIR:-/tmp}/footbag-run-all.XXXXXX")
trap 'rm -rf "$LOG_DIR"' EXIT

# The gate a Ctrl-C or a kill lands in, named in the report the interrupt prints.
CURRENT_GATE=""

summarize() {
  echo ""
  echo "=============================================="
  echo " run_all_tests.sh — summary"
  echo "=============================================="
  local i
  for i in "${!GATE_NAMES[@]}"; do
    printf '  %-28s %s\n' "${GATE_NAMES[$i]}" "${GATE_RESULTS[$i]}"
  done
  echo "=============================================="
  if (( ${#FAIL_LOGS[@]} > 0 )); then
    echo " FAILED gates (${#FAIL_LOGS[@]}): ${FAIL_LOGS[*]}"
    echo "=============================================="
  fi
  echo " Every gate's full output: ${GATE_LOG_DIR}/"
  echo "=============================================="
}

# What a failed gate's log is reduced to at the end of the run: the lines that
# say something failed, wherever in the log they appeared, then the tail for
# context. A blind tail was the wrong selection. A coverage run prints its table
# after the failing assertions and pytest prints long tracebacks before its
# summary, so the last sixty lines were the table or the middle of a traceback and
# the error itself was above them. The same grammar the clean room uses, so the
# two reports select alike.
FAILURE_GRAMMAR='FAIL|FAILED|ERROR|Error:|error TS[0-9]|AssertionError|Traceback|✕|✗|×|violat|REFUSED|not ok'

recap_gate_log() {
  local log="$1" hits total
  # `|| true` because grep finds nothing in a clean log, and under pipefail head
  # closing the pipe early can end grep on SIGPIPE; either would stop the run here.
  hits="$(grep -nE "$FAILURE_GRAMMAR" "$log" | head -n 40 || true)"
  if [[ -n "$hits" ]]; then
    total="$(grep -cE "$FAILURE_GRAMMAR" "$log" || true)"
    echo "  lines naming a failure (${total:-0} in the log, first 40, numbered into it):"
    printf '%s\n' "$hits" | sed 's/^/    /'
    echo ""
  fi
  echo "  last 20 lines:"
  tail -n 20 "$log" | sed 's/^/    /'
}

# Re-show every failed gate at the end of the run, where the reader is, rather
# than thousands of lines up where it streamed past.
dump_failures() {
  (( ${#FAIL_LOGS[@]} == 0 )) && return 0
  echo ""
  echo "=============================================="
  echo " failure details (${#FAIL_LOGS[@]} gate(s))"
  echo "=============================================="
  local name log
  for name in "${FAIL_LOGS[@]}"; do
    log="${GATE_LOG_DIR}/${name}.log"
    echo ""
    echo "──── ${name} ────"
    if [[ -s "$log" ]]; then
      recap_gate_log "$log"
      echo "  full output: ${log}"
    else
      echo "  (no captured output)"
    fi
  done
  echo "=============================================="
}

# Lines worth reading that a passing or skipped gate printed and nobody saw: a
# warning, a check that did not run, a stubbed seam, a deprecation. They streamed
# past an hour before the end, so they are collected here, from the preflight and
# from every gate, whatever its result.
NOTICE_GRAMMAR='WARNING|WARN[: ]|\[missing\]|NOT RUN|INCOMPLETE|[Nn]ote:|SYNTHETIC|deprecated|skipping|still missing|not installed|absent|[0-9]+ skipped|^SKIPPED'

notices_from() {
  local label="$1" log="$2" hits total
  [[ -s "$log" ]] || return 0
  # A check that did not run comes first, so the cap below can never hide one
  # behind warnings printed earlier in the log. A passing test's own line (✓) is
  # never a notice, however its name reads: "absent" in a test title is not
  # something absent from this run.
  hits="$( { grep -E 'NOT RUN' "$log"; grep -E "$NOTICE_GRAMMAR" "$log"; } | grep -v '✓' | awk '!seen[$0]++' | head -n 15 || true)"
  [[ -n "$hits" ]] || return 0
  total="$(grep -E "$NOTICE_GRAMMAR" "$log" | grep -v '✓' | awk '!seen[$0]++' | wc -l || true)"
  echo ""
  echo "──── ${label} ────"
  printf '%s\n' "$hits" | sed 's/^/    /'
  (( total > 15 )) && echo "    (${total} in all; the rest are in ${log})"
  return 0
}

print_notices() {
  echo ""
  echo "=============================================="
  echo " notices (warnings and checks not run, from every gate)"
  echo "=============================================="
  notices_from preflight "$PREFLIGHT_LOG"
  local name
  for name in "${GATE_NAMES[@]}"; do
    notices_from "$name" "${GATE_LOG_DIR}/${name}.log"
  done
  # The clean room ends by naming what it could not prove and which tools answer
  # there with this machine's version rather than the runner's.
  if [[ -s "${GATE_LOG_DIR}/clean-room.log" ]]; then
    local block
    block="$(sed -n '/NOT PROVEN BY THIS RUN/,/^=\{10,\}/p' "${GATE_LOG_DIR}/clean-room.log" || true)"
    if [[ -n "$block" ]]; then
      echo ""
      echo "──── clean-room: not proven by that run ────"
      printf '%s\n' "$block" | sed 's/^/  /'
    fi
  fi
  echo "=============================================="
}

# Why a gate skipped, for its summary row. The clean room names each check it
# could not run; any other gate says why on its last line.
skip_reason() {
  local log="$1" reason
  # The room's summary rows, one per gate it could not run. Matched by the row's
  # shape, because the room also says "NOT RUN" in prose earlier in its output.
  reason="$(grep -E '^[[:space:]]+[a-z0-9-]+[[:space:]]+NOT RUN \(' "$log" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+/ /g' | paste -sd ';' - || true)"
  [[ -n "$reason" ]] || reason="$(grep -v '^[[:space:]]*$' "$log" | tail -n 1 | sed -E 's/^[[:space:]]+//' || true)"
  # Never cut: a truncated list drops exactly the gates at its end.
  printf '%s' "${reason:-no reason printed}"
}

# A Ctrl-C or a kill used to end the run with no report at all, and the exit trap
# then deleted every log. The logs now outlive the run, and the report for the
# gates that finished is printed on the way out, naming the one interrupted.
on_interrupt() {
  trap - INT TERM
  echo "" >&2
  echo "→ run_all_tests.sh: INTERRUPTED${CURRENT_GATE:+ during the ${CURRENT_GATE} gate}. The report below covers the gates that finished." >&2
  # The room writes each gate's line as that gate finishes, so the ones it
  # completed before the interrupt still get their rows.
  if [[ "$CURRENT_GATE" == clean-room && -n "${CLEAN_ROOM_RESULTS:-}" ]]; then
    import_clean_room_results "$CLEAN_ROOM_RESULTS"
  fi
  summarize
  dump_failures
  print_notices
  print_not_checked
  exit 130
}
trap on_interrupt INT TERM

# run_gate NAME CMD...   — a gate may return 77 to signal SKIP. Each row carries
# the gate's elapsed seconds, so a long run says where its time went.
run_gate() {
  local name="$1"; shift
  echo ""
  echo "→ [${name}] running: $*"
  local rc=0 log="${GATE_LOG_DIR}/${name}.log" started=$SECONDS took
  CURRENT_GATE="$name"
  # tee keeps the live output while capturing it; PIPESTATUS[0] is the gate's
  # own exit code (not tee's). Toggle set -e so a failing gate does not abort
  # the whole pipeline before we record its result.
  #
  # The pipeline runs inside one subshell, so this shell, which holds the
  # interrupt trap, waits on a single foreground child. An interrupt that landed
  # while this shell was still setting up a two-process pipeline left it
  # spinning in its signal handler for good, with the trap never run and both
  # children never reaped; with one child there is no such window.
  set +e
  ( "$@" 2>&1 | tee "$log"; exit "${PIPESTATUS[0]}" )
  rc=$?
  set -e
  took=$(( SECONDS - started ))
  CURRENT_GATE=""
  GATE_NAMES+=("$name")
  if (( rc == 0 )); then
    GATE_RESULTS+=("PASS [${took}s]")
    echo "→ [${name}] PASS (${took}s)"
  elif (( rc == 77 )); then
    GATE_RESULTS+=("SKIP ($(skip_reason "$log")) [${took}s]")
    echo "→ [${name}] SKIP (${took}s)"
  else
    GATE_RESULTS+=("FAIL (exit ${rc}) [${took}s]")
    FAIL_LOGS+=("$name")
    ANY_FAIL=1
    if [[ "$name" == staging-* ]]; then STAGING_ANY_FAIL=1; else LOCAL_ANY_FAIL=1; fi
    echo "ERROR: [${name}] FAILED (exit ${rc}, ${took}s)" >&2
  fi
  # Here rather than after the call, so a fail-fast exit below still reports each
  # gate the clean room ran. The gate itself ran in a subshell and cannot do it.
  if [[ "$name" == clean-room && -n "${CLEAN_ROOM_RESULTS:-}" ]]; then
    import_clean_room_results "$CLEAN_ROOM_RESULTS"
  fi
  if (( rc != 0 && rc != 77 )); then
    if (( FAIL_FAST == 1 )); then
      # Report before the fingerprint guard, not after: it exits 2 on its own, and
      # its most common trip is an unrelated concurrent writer rather than
      # anything a gate did. Going first, it threw away the gate table and every
      # failure tail this run had already produced. See the same ordering in
      # final_verdict.
      summarize
      dump_failures
      print_notices
      print_not_checked
      assert_real_data_untouched
      exit 1
    fi
  fi
}

# A summary row for something this run did not execute as a gate of its own,
# with the reason in the row.
note_gate() {
  GATE_NAMES+=("$1")
  GATE_RESULTS+=("$2")
  echo "→ [$1] $2"
}

SKIPPED_PREDICTIVE=()
SKIPPED_LOCAL_ONLY=()
NOT_SCHEDULED_QUICK=()
NOT_SCHEDULED_OPT_IN=()

# What this run did not check, printed on every exit that reports: the normal end,
# a fail-fast stop and an interrupt. It fills SKIPPED_PREDICTIVE, which the final
# verdict reads.
#
# Printed on every run, including a clean one. The question this runner exists to
# answer is "will my push pass", and the honest answer always carries a footnote:
# a short list of things GitHub will do that no workstation can. Printing it only
# on failure would teach the reader that a clean run checked everything, which is
# the belief that makes a surprise red mark surprising.
print_not_checked() {
  local i _equivalent _opt_in names
  SKIPPED_PREDICTIVE=()
  SKIPPED_LOCAL_ONLY=()
  NOT_SCHEDULED_QUICK=()
  NOT_SCHEDULED_OPT_IN=()
  names="$(printf '%s\n' "${GATE_NAMES[@]}")"
  SKIPPED_CI_COVERED=()
  for i in "${!GATE_NAMES[@]}"; do
    [[ "${GATE_RESULTS[$i]}" == SKIP* ]] || continue
    if grep -qw "${GATE_NAMES[$i]}" <<< "$PUSH_GATE_EQUIVALENTS"; then
      # A push-gate check that skipped itself here (a tool this machine lacks) is
      # run by continuous integration on every push, and the release gate requires
      # that run green for the commit, so it is named rather than held against the
      # verdict. A check with no result at all stays below, as a real gap.
      SKIPPED_CI_COVERED+=("${GATE_NAMES[$i]}: ${GATE_RESULTS[$i]}")
    else
      SKIPPED_LOCAL_ONLY+=("${GATE_NAMES[$i]}: ${GATE_RESULTS[$i]}")
    fi
  done

  # A gate this mode never scheduled is as unchecked as one that tried and could
  # not run, and counting only the second is how a --quick run once came to
  # announce that everything the push gate runs had passed here. Under --quick
  # they are named as what it leaves out, and its verdict says the bare run runs them.
  for _equivalent in $PUSH_GATE_EQUIVALENTS; do
    grep -qx "$_equivalent" <<< "$names" && continue
    if (( FULL == 1 )) && grep -qx clean-room <<< "$names"; then
      # In the bare run every one of these is scheduled, in the checkout or in the
      # clean room, so a missing row means the room stopped before reporting it.
      SKIPPED_PREDICTIVE+=("${_equivalent} (the clean room runs it in the bare run and reported no result; see the clean-room row)")
    elif (( FULL == 1 )); then
      SKIPPED_PREDICTIVE+=("${_equivalent} (not reached: the run stopped before the clean room, which runs it in the bare run)")
    else
      NOT_SCHEDULED_QUICK+=("${_equivalent} (left out by --quick; the bare run runs it)")
    fi
  done

  # The opt-in gates this mode never scheduled, each with the switch that runs
  # it. None stands for a push-gate job, but a run that says nothing about them
  # lets the reader believe it ran everything. The a11y scan is not missing where
  # the e2e gate ran, since that gate runs every @a11y spec.
  for _opt_in in \
    "persona-crawl:--with-persona-crawl" \
    "realdata-invariants:--with-realdata-invariants" \
    "strong-hash:the bare run" \
    "a11y:--a11y" \
    "pentest:--pentest" \
    "legacy-mirror:--with-legacy-mirror"; do
    grep -qx "${_opt_in%%:*}" <<< "$names" && continue
    if [[ "${_opt_in%%:*}" == a11y ]] && grep -qx e2e <<< "$names"; then continue; fi
    NOT_SCHEDULED_OPT_IN+=("${_opt_in%%:*} (not run; ${_opt_in#*:} runs it)")
  done
  if (( ${AUDIT:-0} == 0 )); then
    NOT_SCHEDULED_OPT_IN+=("the dependency audit (not run; --audit runs it, before a production deploy)")
  fi
  if (( ${ZAP:-0} == 0 )); then
    NOT_SCHEDULED_OPT_IN+=("the ZAP scan (not run; --zap runs it, before a production deploy)")
  fi
  if (( STAGING == 0 )); then
    NOT_SCHEDULED_OPT_IN+=("the read-only staging checks (not run; --staging runs them, with the dev-tester role)")
  fi

  echo ""
  echo "=============================================="
  echo " WHAT THIS RUN DID NOT CHECK"
  echo "=============================================="
  echo "  Never checkable on any workstation:"
  echo "    CodeQL static analysis   runs on GitHub's own infrastructure. It reports"
  echo "                             findings into the repository's code-scanning view"
  echo "                             rather than failing the push."
  echo "    dependency review        runs only on a pull request, and only looks at a"
  echo "                             change to the dependency list."
  if (( ${#SKIPPED_LOCAL_ONLY[@]} > 0 )); then
    echo ""
    echo "  Not run here, and not run by the push gate either, so they change nothing"
    echo "  about whether your push passes:"
    printf '    %s\n' "${SKIPPED_LOCAL_ONLY[@]}"
  fi
  echo ""
  echo "  WARNING: opt-in checks this run did not do. The push gate does not run"
  echo "  them either, so they change nothing about whether your push passes:"
  if (( ${#NOT_SCHEDULED_OPT_IN[@]} > 0 )); then
    printf '    %s\n' "${NOT_SCHEDULED_OPT_IN[@]}"
  fi
  # The pentest gate runs the scriptable probes, and the passive ZAP baseline only
  # under --zap (named above when it did not run); the harness's two heavier legs
  # run only when asked for, whatever this runner's flags.
  echo "    pentest active ZAP scan and dependency scan (not run; npm run test:pentest:heavy -- --all runs them)"
  if (( ${#NOT_SCHEDULED_QUICK[@]} > 0 )); then
    echo ""
    echo "  THE PUSH GATE ALSO RUNS THESE, WHICH --quick LEAVES OUT:"
    printf '    %s\n' "${NOT_SCHEDULED_QUICK[@]}"
  fi
  if (( ${#SKIPPED_CI_COVERED[@]} > 0 )); then
    echo ""
    echo "  CONTINUOUS INTEGRATION RUNS THESE ON EVERY PUSH; THIS MACHINE SKIPPED THEM:"
    printf '    %s\n' "${SKIPPED_CI_COVERED[@]}"
  fi
  if (( ${#SKIPPED_PREDICTIVE[@]} > 0 )); then
    echo ""
    echo "  THE PUSH GATE RUNS THESE AND THIS RUN COULD NOT:"
    printf '    %s\n' "${SKIPPED_PREDICTIVE[@]}"
  fi
  echo "=============================================="
}

# run_gate for a gate the clean room carries in the bare run: runs it in every other
# mode, and in the bare run leaves it to the room, whose own row replaces it.
checkout_gate() {
  if room_carries "$1"; then
    echo ""
    echo "→ [$1] left to the clean room, which runs it once against what the push would carry"
    return 0
  fi
  run_gate "$@"
}

# One summary row per gate the clean room ran, read from the file it writes, so
# the table says which check failed rather than only that the room did. The
# room's own row still carries the verdict and the failure recap; these rows add
# no failure of their own. The coverage run is the unit and integration tiers, so
# those two rows follow its result.
import_clean_room_results() {
  local file="$1" label status detail coverage_status="" tier
  [[ -s "$file" ]] || return 0
  while IFS=$'\t' read -r label status detail; do
    [[ -n "$label" ]] || continue
    case "$status" in
      PASS)   GATE_RESULTS+=("PASS (clean room)") ;;
      FAIL)   GATE_RESULTS+=("FAIL (clean room${detail:+, ${detail}})") ;;
      NOTRUN) GATE_RESULTS+=("NOT RUN (clean room: ${detail:-no reason given})") ;;
      *)      continue ;;
    esac
    GATE_NAMES+=("$label")
    [[ "$label" == coverage ]] && coverage_status="$status"
  done < "$file"
  [[ -n "$coverage_status" ]] || return 0
  for tier in unit integration; do
    # A here-string, not a pipe: grep -q exiting early can kill the writer on
    # SIGPIPE, and under pipefail a match then reads as a miss.
    grep -qx "$tier" <<< "$(printf '%s\n' "${GATE_NAMES[@]}")" && continue
    GATE_NAMES+=("$tier")
    case "$coverage_status" in
      PASS) GATE_RESULTS+=("PASS (clean room, in the coverage run)") ;;
      FAIL) GATE_RESULTS+=("FAIL (clean room, in the coverage run)") ;;
      *)    GATE_RESULTS+=("NOT RUN (clean room: the coverage run did not run)") ;;
    esac
  done
  return 0
}

# -----------------------------------------------------------------------------
# The pass receipts and the verdict.
# -----------------------------------------------------------------------------

# How many skipped rows stand between this run and a local pass receipt. A skipped
# gate is a check that did not happen, so it withholds the receipt, with two
# exceptions: a staging row, which the staging receipt answers for, and a
# real-data row on a machine with no authoritative load, where it is not required.
receipt_voiding_skips() {
  local i n=0
  for i in "${!GATE_NAMES[@]}"; do
    [[ "${GATE_RESULTS[$i]}" == SKIP* ]] || continue
    [[ "${GATE_NAMES[$i]}" == staging-* ]] && continue
    # Continuous integration runs every push-gate check and the release gate
    # requires it green for the commit, so a local skip of one proves no less.
    grep -qw "${GATE_NAMES[$i]}" <<< "$PUSH_GATE_EQUIVALENTS" && continue
    if [[ "${REALDATA_SOURCE:-}" == none && " ${REALDATA_ROWS} " == *" ${GATE_NAMES[$i]} "* ]]; then
      continue
    fi
    n=$((n + 1))
  done
  echo "$n"
}

# The receipt the production release gate reads, so a production deploy of this
# exact tree need not run the whole suite again (scripts/lib/full-pass-receipt.sh
# says where it lives and why). Called only once the local gates are GREEN. It
# records what was proven (commit, tree fingerprint, whether the tree was clean)
# and by which runner, so the gate can refuse a receipt for anything else.
write_full_pass_receipt() {
  local voiding runner_hash receipt
  voiding="$(receipt_voiding_skips)"
  runner_hash="$(sha256sum run_all_tests.sh 2>/dev/null | cut -d' ' -f1 || true)"
  if (( voiding > 0 )); then
    echo "  No pass receipt: ${voiding} gate(s) skipped, so this run cannot vouch for a production release."
    return 0
  fi
  if [[ -z "$runner_hash" ]]; then
    echo "  No pass receipt: sha256sum is unavailable, so the runner cannot be identified."
    return 0
  fi
  receipt="$(full_pass_receipt_path)"
  (
    umask 077
    {
      echo "verdict=GREEN"
      echo "commit=$(git rev-parse HEAD)"
      echo "tree=${SOURCE_TREE_BEFORE}"
      echo "clean=$([[ -z "$SOURCE_TREE_LIST_BEFORE" ]] && echo yes || echo no)"
      echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "runner=${runner_hash}"
    } > "$receipt"
  )
  echo "  Pass receipt for the production release gate: ${receipt}"
}

# The staging receipt, written straight after the staging rows and independent of
# everything after them: every staging row must have passed, and it is keyed to
# the commit the staging preflight read from the host, since that is the deploy
# the rows tested. Without a readable commit there is nothing to key it to, and
# the gate would match it against nothing, so none is written.
write_staging_pass_receipt() {
  local row i found runner_hash receipt
  for row in staging-aws-smoke staging-realdata-invariants staging-route-smoke staging-browser; do
    found=""
    for i in "${!GATE_NAMES[@]}"; do
      [[ "${GATE_NAMES[$i]}" == "$row" ]] && found="${GATE_RESULTS[$i]}"
    done
    if [[ "$found" != PASS* ]]; then
      echo "  No staging pass receipt: ${row} did not pass (${found:-not run})."
      return 0
    fi
  done
  if [[ -z "${STAGING_DEPLOYED_COMMIT:-}" ]]; then
    echo "  No staging pass receipt: what staging runs could not be read, so the pass has no commit to vouch for."
    return 0
  fi
  runner_hash="$(sha256sum run_all_tests.sh 2>/dev/null | cut -d' ' -f1 || true)"
  if [[ -z "$runner_hash" ]]; then
    echo "  No staging pass receipt: sha256sum is unavailable, so the runner cannot be identified."
    return 0
  fi
  receipt="$(staging_pass_receipt_path)"
  (
    umask 077
    {
      echo "verdict=GREEN"
      echo "commit=${STAGING_DEPLOYED_COMMIT}"
      echo "dirty=${STAGING_DEPLOYED_DIRTY:-}"
      echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "runner=${runner_hash}"
    } > "$receipt"
  )
  echo "  Staging pass receipt for the production release gate: ${receipt} (staging runs ${STAGING_DEPLOYED_COMMIT})"
}

# The verdicts, after the whole report. The real-data guard exits 2 the moment it
# trips, and what trips it is usually a legacy mirror crawl writing alongside the
# run rather than a gate misbehaving, so it must not run before the reader has
# the results. The one-tree guard invalidates the verdict, so it comes before it.
# The local verdict is judged on the local rows only; a staging failure then
# fails the run without taking back what the local rows proved.
final_verdict() {
  local code=0
  assert_real_data_untouched

  if ! assert_source_tree_unchanged; then
    exit 4
  fi

  if (( LOCAL_ANY_FAIL == 1 )); then
    echo "→ run_all_tests.sh: one or more gates FAILED." >&2
    exit 1
  fi

  # A tool the project uses belongs on the workstation. Its absence does not fail
  # the run, because continuous integration runs the check, but it is never quiet.
  if (( ${#SKIPPED_CI_COVERED[@]} > 0 )); then
    echo "WARNING: this machine lacks a tool the project uses, so these checks were skipped here" >&2
    echo "  (continuous integration runs them on every push):" >&2
    printf '    %s\n' "${SKIPPED_CI_COVERED[@]}" >&2
    echo "  Install what they need: bash scripts/setup-dev-workstation.sh reports how." >&2
  fi

  if (( ${#SKIPPED_PREDICTIVE[@]} > 0 )); then
    echo "→ run_all_tests.sh: INCOMPLETE. Everything that ran passed, but the gates named" >&2
    echo "  above stand for push-gate jobs and did not run, so this run cannot tell you" >&2
    echo "  whether your push will pass." >&2
    code=3
  elif (( ${SKIP_PY:-0} == 1 )); then
    # Asked for, not a missing tool: the Python gates are named NOT RUN in the
    # clean-room rows above, and a run that left them out vouches for nothing
    # a production release needs, so it writes no receipt.
    echo "→ run_all_tests.sh: INCOMPLETE. Everything that ran passed, but --skip-py left" >&2
    echo "  out every Python gate (named NOT RUN above), so this run writes no pass receipt" >&2
    echo "  and cannot tell you whether your push will pass." >&2
    code=3
  elif (( FULL == 1 )); then
    echo "→ run_all_tests.sh: GREEN. Everything the push gate runs, apart from the two"
    echo "  GitHub-only jobs named above, ran here and passed."
    write_full_pass_receipt
  else
    echo "→ run_all_tests.sh: QUICK PASS. Everything --quick schedules passed. The push"
    echo "  gate also runs the gates named above, which the bare run runs."
  fi

  if (( STAGING_ANY_FAIL == 1 )); then
    echo "→ run_all_tests.sh: the staging rows FAILED (named above). The local verdict above" >&2
    echo "  stands on its own; the staging checks did not pass and wrote no staging receipt." >&2
    code=1
  fi
  exit "$code"
}

# -----------------------------------------------------------------------------
# Compound / conditional gate bodies.
# -----------------------------------------------------------------------------
gate_terraform() {
  if ! command -v terraform >/dev/null 2>&1; then
    echo "  terraform CLI absent — skipping (CI's terraform job covers it)."
    return 77
  fi
  # Every check runs and every failure is named. run_gate calls this with errexit
  # off, so a step's status is either collected here or lost: left alone, the
  # function's status was the last tree's, and a broken format check or a broken
  # earlier tree reported PASS while the push gate's terraform job went red.
  local failed=()
  ( cd terraform && aws_isolated_run terraform fmt -check -recursive ) || failed+=("fmt -check")
  local d data_dir
  local plugin_arg=()
  # Terraform's own provider cache, in the conventional place under the home
  # directory: providers are hundreds of megabytes per stack, and the data
  # directory below is thrown away after every run, so without a cache that
  # outlives it every run downloads them all again for every stack. Outside the
  # repository, so it is never tracked and never read as a change to the tree.
  local plugin_cache="${TF_PLUGIN_CACHE_DIR:-${HOME}/.terraform.d/plugin-cache}"
  mkdir -p "$plugin_cache"
  for d in staging production shared identity; do
    # `-backend=false` disables *configuring* a backend, not *using* one:
    # terraform's own help says it uses "what was previously initialized
    # instead". An operator's `terraform init` leaves a .terraform holding the S3
    # state backend, so this gate used to load it and call STS on every run —
    # green while the key worked, and blaming terraform for a dead key once it
    # stopped. A throwaway TF_DATA_DIR leaves no previous initialization to
    # reuse, which is what makes the init offline; it lands under LOG_DIR so the
    # existing EXIT trap removes it and the operator's own .terraform (which the
    # staging smoke reads outputs from) is never touched.
    #
    # -plugin-dir reuses the providers already on disk, ~740M per stack, so
    # nothing is re-downloaded. Where there is no local mirror it is omitted and
    # init resolves providers through the shared cache above, downloading only
    # what the cache does not yet hold.
    #
    # aws_isolated_run is what keeps this honest: it is enforcement, not
    # decoration. Remove it and a future edit can start reaching AWS again
    # without anything failing on a machine where a key happens to work.
    data_dir="${LOG_DIR}/terraform-${d}"
    plugin_arg=()
    [[ -d "terraform/$d/.terraform/providers" ]] && plugin_arg=(-plugin-dir=.terraform/providers)
    (
      cd "terraform/$d"
      export TF_DATA_DIR="$data_dir"
      export TF_PLUGIN_CACHE_DIR="$plugin_cache"
      aws_isolated_run terraform init -backend=false \
        ${plugin_arg[@]+"${plugin_arg[@]}"} >/dev/null \
        && aws_isolated_run terraform validate >/dev/null
    ) || failed+=("$d")
    # init and validate print nothing useful on success, so without this line
    # a passing gate's log is empty and cannot show which stacks it covered.
    [[ " ${failed[*]-} " == *" $d "* ]] || echo "terraform: ${d} initialised and validated"
  done
  if (( ${#failed[@]} )); then
    echo "ERROR: terraform failed: ${failed[*]}" >&2
    return 1
  fi
}

# Reclaim a TCP port from any leaked holder before the e2e gate. Playwright's
# webServer runs with reuseExistingServer:false, so a stray dev server on 3000
# (or image worker on 4001) makes the gate fail with "port already used". Mirror
# run_dev.sh's kill_port: TERM, brief wait, then KILL.
reclaim_port() {
  local port="$1" pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti:"${port}" 2>/dev/null || true)
  elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "${port}/tcp" 2>/dev/null | tr -d ' ' || true)
  fi
  if [[ -n "$pids" ]]; then
    echo "  → reclaiming port ${port} from PIDs: ${pids}"
    kill -TERM ${pids} 2>/dev/null || true
    sleep 1
    kill -KILL ${pids} 2>/dev/null || true
  fi
}

gate_e2e() {
  reclaim_port 3000
  reclaim_port 4001
  npm run test:e2e
}

gate_a11y() {
  # Boots the same throwaway e2e stack, so reclaim its ports first like the e2e
  # gate. Runs only the @a11y-tagged Playwright tests (the axe WCAG 2.1 AA scan
  # of the high-traffic public pages plus the keyboard/label checks). The stack
  # writes only to os.tmpdir(), so the no-real-data guard stays satisfied.
  reclaim_port 3000
  reclaim_port 4001
  npm run test:e2e:a11y
}

gate_pentest() {
  # Boots a throwaway stack on 3000/4001, so reclaim those ports first like the
  # e2e gate. The ZAP leg self-skips when Docker is absent; the scriptable probes
  # still run. The harness writes only to os.tmpdir(), so the no-real-data guard
  # stays satisfied.
  reclaim_port 3000
  reclaim_port 4001
  if (( ZAP == 1 )); then
    npm run test:pentest:heavy
  else
    npm run test:pentest:heavy -- --no-zap
  fi
}

gate_security_probes() {
  # The blocking security probes both deploy scripts run against a deployed
  # target (auth-gate enforcement, anti-enumeration response equivalence, the
  # dev-surface environment contract), pointed at a throwaway local stack so the
  # same contract is checked before a push rather than only after a deploy. The
  # anti-enumeration probe needs the canonical personas registered, which is why
  # the refresh call runs before the probes. The stack writes only to
  # os.tmpdir(), so the no-real-data guard stays satisfied.
  reclaim_port 3000
  reclaim_port 4001
  bash scripts/e2e/start-stack.sh &
  local stack_pid=$! rc=0 i
  for i in $(seq 1 60); do
    curl -fsS http://127.0.0.1:3000/health/ready >/dev/null 2>&1 && break
    sleep 1
  done
  if curl -fsS http://127.0.0.1:3000/health/ready >/dev/null 2>&1; then
    curl -fsS -X POST -H "Origin: http://127.0.0.1:3000" \
      http://127.0.0.1:3000/dev/personas/refresh >/dev/null || rc=$?
    if (( rc == 0 )); then
      BASE_URL=http://127.0.0.1:3000 SMOKE_ENV=development \
        bash scripts/smoke-security.sh || rc=$?
    fi
  else
    echo "  stack never became ready — failing the gate." >&2
    rc=1
  fi
  # The gate owns the stack it started: tear it down on every path, including
  # failure, so no leaked server holds the port for the next gate or the next run.
  kill -TERM "$stack_pid" 2>/dev/null || true
  wait "$stack_pid" 2>/dev/null || true
  reclaim_port 3000
  reclaim_port 4001
  return "$rc"
}

gate_persona_crawl() {
  # The real-claim crawl builds a claimed account for a real migrated record via
  # /dev/build-claim, against loaded pipeline data and the real image worker. The
  # in-suite seeded-persona crawl runs separately in the integration gate.
  #
  # Local only. The build registers, verifies and claims an account, so the base
  # URL must be loopback: an address exported in the shell would otherwise send
  # those writes to whatever it names. Refused before anything boots.
  local base="${PERSONA_CRAWL_BASE_URL:-http://localhost:3000}"
  local loopback_re='^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?(/.*)?$'
  if [[ ! "$base" =~ $loopback_re ]]; then
    echo "ERROR: PERSONA_CRAWL_BASE_URL is ${base}, which is not a loopback address (localhost, 127.0.0.1 or [::1])." >&2
    echo "  The crawl registers and claims an account, so it only ever walks a stack on this machine." >&2
    echo "Recommendation: unset PERSONA_CRAWL_BASE_URL, or point it at a stack on this machine." >&2
    return 1
  fi

  # Without the authoritative load there is no real record to claim here, and
  # the row is not required.
  realdata_source
  if [[ "$REALDATA_SOURCE" != local ]]; then
    echo "  not required: no authoritative member load on this machine, so there is no real record to claim (the footbag.org member data is operator-held)."
    return 77
  fi

  # The booted stack serves FOOTBAG_DB_PATH when it is set, so that is the file
  # probed: a claimable real record (a Hall-of-Fame honoree with a legacy link,
  # the crawl's default target). A name-free, dataset-agnostic probe.
  local db="${FOOTBAG_DB_PATH:-database/footbag.db}"
  local have_db=0
  if [[ -f "$db" ]] && command -v sqlite3 >/dev/null 2>&1; then
    local claimable
    claimable=$(sqlite3 -readonly "$db" "SELECT COUNT(*) FROM historical_persons WHERE hof_member=1 AND legacy_member_id IS NOT NULL;" 2>/dev/null || echo 0)
    [[ "${claimable}" != "0" ]] && have_db=1
  fi
  if (( have_db == 0 )); then
    echo "ERROR: persona crawl needs a loaded dev DB at ${db} (a claimable Hall-of-Fame record)." >&2
    echo "Recommendation: build the dev DB with ./run_dev.sh --from-csv or --all-data, then re-run." >&2
    return 1
  fi

  reclaim_port 3000
  reclaim_port 4001

  # Boot the dev stack (web + image worker) against the existing loaded DB. No
  # rebuild flag → no DB work, so nothing is written under legacy_data/ or
  # curated/ and the real-data fingerprint guard stays satisfied.
  # scripts/dev.sh installs a trap that kills both children on SIGTERM, so
  # signaling this PID cascades the shutdown; reclaim_port is the backstop.
  ./run_dev.sh >"${LOG_DIR}/persona-stack.log" 2>&1 &
  local stack_pid=$!

  local ready=0 i
  for i in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 2 "${base}/" 2>/dev/null; then ready=1; break; fi
    kill -0 "${stack_pid}" 2>/dev/null || break
    sleep 2
  done

  local rc=0
  if (( ready == 0 )); then
    # The stack's log lives under LOG_DIR, which this script's EXIT trap removes,
    # so naming the path hands the reader a file that is gone by the time they
    # read the message. Whatever the stack said about why it would not boot — a
    # port still held, a schema mismatch, a worker that died — is printed here or
    # it is lost.
    echo "ERROR: dev stack did not become ready at ${base} within the timeout." >&2
    echo "Last 60 lines of the stack's own output:" >&2
    if [[ -s "${LOG_DIR}/persona-stack.log" ]]; then
      tail -n 60 "${LOG_DIR}/persona-stack.log" >&2
    else
      echo "  (the stack produced no output at all)" >&2
    fi
    rc=1
  else
    npm run test:persona-crawl
    rc=$?
  fi

  kill -TERM "${stack_pid}" 2>/dev/null || true
  sleep 3
  kill -KILL "${stack_pid}" 2>/dev/null || true
  reclaim_port 3000
  reclaim_port 4001
  return $rc
}

gate_realdata_invariants() {
  # Read-only, PII-safe whole-population invariants over this machine's
  # authoritative load. Emits only counts and PASS/FAIL, never names or emails,
  # and runs no writer, so the real-data fingerprint guard stays satisfied.
  # Without the load the row is not required; --staging checks staging's copy.
  #
  # A 78 from the import gates means the members are entirely mirror-derived,
  # so the authoritative-only gates (real_name, honor flags) cannot pass for want
  # of data: a hard error. And an '@' anywhere in the output means a query
  # selected a contact field, so the output is withheld and the gate fails
  # rather than letting a real address reach a test log.
  local db="${FOOTBAG_DB_PATH:-./database/footbag.db}"
  local out rc=0 mirror_only=0

  realdata_source
  if [[ "$REALDATA_SOURCE" != local ]]; then
    echo "  not required: no authoritative member load on this machine (the footbag.org member data is operator-held); --staging checks staging's copy read-only."
    return 77
  fi

  # The field/reconciliation gates (G1-G6), then, unless the load is mirror-only,
  # the referential-integrity checks (RI1-RI3) from the one script that also
  # runs on the staging host.
  local g_out g_rc=0 ri_out ri_rc=0
  g_out=$(FOOTBAG_DB_PATH="${db}" bash scripts/validate-legacy-import-gates.sh 2>&1) || g_rc=$?
  out="$(printf '── reconciliation + field invariants (G1-G6) ──\n%s' "${g_out}")"
  if (( g_rc == 78 )); then
    mirror_only=1
    rc=78
  else
    ri_out=$(FOOTBAG_DB_PATH="${db}" bash scripts/validate-realdata-ri.sh 2>&1) || ri_rc=$?
    out="$(printf '%s\n── referential integrity ──\n%s' "${out}" "${ri_out}")"
    (( g_rc == 0 && ri_rc == 0 )) || rc=1
  fi
  realdata_invariants_verdict "$out" "$rc" "$mirror_only" \
    "the local legacy_members are entirely mirror-derived; load the authoritative member data, or leave this check to --staging, which reads staging's copy."
}

# realdata_invariants_verdict <output> <rc> <mirror-only 0|1> <mirror-only advice>
# The verdict both sources share: the PII self-check over whatever output was
# produced, before any of it is printed, then the mirror-only refusal, then the
# checks' own status.
realdata_invariants_verdict() {
  local out="$1" rc="$2" mirror_only="$3" advice="$4"
  if grep -q '@' <<< "${out}"; then
    echo "ERROR: real-data invariant output contains an '@' (possible PII leak); withholding it and refusing to pass." >&2
    return 1
  fi
  printf '%s\n' "${out}"
  if (( mirror_only == 1 )); then
    echo "ERROR: real-data invariants need the authoritative legacy load; the legacy_members are entirely mirror-derived." >&2
    echo "Recommendation: ${advice}" >&2
    return 1
  fi
  return "${rc}"
}

# -----------------------------------------------------------------------------
# The staging rows (--staging only). Each reads staging and writes nothing there,
# never targets production, and fails without running when its preflight found
# what it needs missing. These are the only gates exempt from the offline rule,
# because reaching the staging estate is their purpose.
# -----------------------------------------------------------------------------

# The live-AWS adapter smoke, pinned to staging whatever the shell exports: the
# same read-only tier the testing rules allow to reach AWS (identity and
# parameter reads, a KMS signature).
gate_staging_aws_smoke() {
  staging_blocked staging-aws-smoke && return 1
  env -u DEPLOYED_BASE_URL -u SMOKE_TARGET_ENV \
    npm run test:smoke -- --target "$STAGING_SMOKE_TARGET_ENV"
}

# The whole-population invariants, run on the staging host against its live
# database opened read-only. Only counts and PASS/FAIL lines come back.
gate_staging_realdata_invariants() {
  staging_blocked staging-realdata-invariants && return 1
  local out rc=0 mirror_only=0
  out="$(bash scripts/realdata-staging.sh invariants)" || rc=$?
  out="$(printf '── reconciliation, field and referential-integrity invariants, on staging ──\n%s' "${out}")"
  (( rc == 78 )) && mirror_only=1
  realdata_invariants_verdict "$out" "$rc" "$mirror_only" \
    "staging's database is not carrying the authoritative load; an operator's staging deploy with --all-data loads it."
}

# The route smoke against the staging site. GETs only: its one POST is gated to
# a production target, which this row never is.
gate_staging_route_smoke() {
  staging_blocked staging-route-smoke && return 1
  env -u X_ORIGIN_VERIFY_SECRET \
    BASE_URL="${STAGING_URL}" SMOKE_ENV="$STAGING_ROUTE_SMOKE_ENV" \
    bash scripts/smoke-local.sh
}

# The anonymous browser check against staging: page loads only, no sign-in, and
# the browser's policy-violation report POST aborted before it is sent.
gate_staging_browser() {
  staging_blocked staging-browser && return 1
  env -u DEPLOYED_BASE_URL bash scripts/test-deployed.sh --target "$STAGING_BROWSER_TARGET"
}

# Secret scan, matching CI's gitleaks job. The scan itself lives in a script of
# its own so the pre-commit hook reaches the same check rather than a copy of it;
# that script returns 77 when no scanner is installed, which this runner reports
# as SKIP. --quick passes --skip-ok, as the fast loop always has, so a machine
# without a scanner is not blocked from committing; the push gate still scans.
gate_secret_scan() {
  if (( QUICK == 1 )); then
    bash scripts/ci/secret_scan.sh --skip-ok
  else
    bash scripts/ci/secret_scan.sh
  fi
}

# Dependency audit (audit-ci --moderate). Report-only: an advisory is published
# upstream on its own schedule, so it can arrive on a commit that changed nothing,
# and patching is the maintainer's call on the operational cadence rather than
# something a run forces. The gate always passes; an advisory, or a registry it
# could not reach, prints a WARNING line that the end-of-run notices collect.
gate_audit() {
  local out rc
  out=$(npm run audit 2>&1)
  rc=$?
  printf '%s\n' "$out"
  (( rc == 0 )) && return 0
  # Registry-unreachable signatures: audit-ci surfaces a failed/empty registry
  # response as "code undefined", and npm's own fetch errors carry the endpoint
  # or connection messages. None of these strings appear in a real advisory report.
  if grep -qiE 'code undefined|audit endpoint returned an error|security/audits/[a-z]+ failed|request to .*registry.* failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed' <<< "$out"; then
    echo "WARNING: dependency audit not checked: the npm registry audit endpoint was unreachable."
  else
    echo "WARNING: dependency audit reports advisories (above); report-only, patch on your own schedule."
  fi
  return 0
}

# The legacy-mirror suite runs here under pytest, which would otherwise write into
# legacy_data/ (a .pytest_cache directory there, since its rootdir resolves to
# legacy_data, plus __pycache__ bytecode), landing build artifacts in the
# real-data tree. PYTHONPYCACHEPREFIX redirects every bytecode write to a
# throwaway temp dir outside the tree, and -p no:cacheprovider disables the pytest
# cache, so the gate leaves legacy_data/ byte-for-byte untouched. Any change to
# this invocation must preserve that (verify with the fingerprint guard). The
# legacy-data pipeline suite itself runs in the clean room, as the push gate runs
# it.
#
# It runs under the legacy pipeline's own environment, which carries the same
# requirements file CI's pytest job installs. This runner never builds it: the
# environment lives inside legacy_data/, which no test-runner entry point writes.
# The seeder's environment is never borrowed either: the two are kept apart by
# the interpreter contract in scripts/lib/python-env.sh.
pipeline_python() {
  # shellcheck source=scripts/lib/python-env.sh
  (source scripts/lib/python-env.sh && footbag_python pipeline fail 2>/dev/null)
}

run_legacy_pytest() {
  local py="$1"; shift
  PYTHONPYCACHEPREFIX="${LOG_DIR}/pytest-pycache" "$py" -m pytest "$@" -q -p no:cacheprovider
}

# Opt-in only: the push gate never runs this suite and its code is retired at go-live.
gate_legacy_mirror() {
  local py
  if ! py="$(pipeline_python)"; then
    echo "  the legacy pipeline environment is missing — skipping. Build it with: bash legacy_data/run_pipeline.sh venv"
    return 77
  fi
  run_legacy_pytest "$py" legacy_data/legacy_mirror/tests/
}

# =============================================================================
# THE RUN.
# =============================================================================
run_sequence() {
  if (( STAGING == 1 )); then
    staging_sequence
    write_staging_pass_receipt
  fi
  local_sequence
}

echo "→ run_all_tests.sh starting (mode: $(mode_label))"

run_sequence

# The whole report first: the gate table, the failure details, the notices, and
# what this run did not check. Every exit in final_verdict ends the run, and each
# used to come before part of the report: the real-data guard discarded an hour
# of results over a condition that says nothing about them, and a failed run
# never reached the list of what it had skipped. Nothing after this point prints
# anything a reader needs except the verdict.
summarize
dump_failures
print_notices
print_not_checked
final_verdict

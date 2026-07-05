#!/usr/bin/env bash
# run_all_tests.sh — canonical local full-suite test runner.
#
# Runs every CI gate that is SAFE to run on a developer workstation: type-check,
# lint, dependency audit, convention gate, secret scan, unit + integration
# (vitest), the legacy-data pipeline suite (pytest), e2e (Playwright), and
# terraform fmt/validate. Prints a per-gate pass/fail summary and exits non-zero
# if any gate fails.
#
# SAFE BY DESIGN — never touches real data:
#   - It NEVER invokes the loader-pipeline scripts (scripts/reset-local-db.sh,
#     scripts/ci/stage_*.sh) that write into legacy_data/. Those are a CI-only
#     gate (db-load-smoke), run by GitHub Actions against a clean, empty
#     checkout. See .claude/rules/testing.md.
#   - As defense-in-depth it fingerprints legacy_data/ and curated/ before and
#     after the run and ABORTS non-zero if any changed, so a future gate that
#     writes real data fails the run instead of clobbering.
#   The test suites themselves write only to os.tmpdir() / mktemp.
#
# The live-AWS adapter smoke suite (test:smoke) and the db-load-smoke loader
# gate are NOT part of the default run:
#   - db-load-smoke: CI-only (writes legacy_data fixtures; safe only on an empty
#     checkout). Do not run it locally.
#   - test:smoke: operator workstation against staging AWS; opt in with
#     --with-smoke (requires RUN_STAGING_SMOKE=1 + AWS credentials).
#   - test:pentest:heavy: heavyweight operator pentest; opt in with --pentest
#     (boots a throwaway stack; the OWASP ZAP leg needs Docker, else it skips).
#
# Usage:
#   ./run_all_tests.sh              # full safe suite: build, lint, audit, conventions, secret-scan, unit, integration, python-pipeline, e2e, terraform
#   ./run_all_tests.sh --quick      # fast loop: skips e2e + terraform
#   ./run_all_tests.sh --with-smoke # additionally run the staging-AWS smoke suite (needs RUN_STAGING_SMOKE=1)
#   ./run_all_tests.sh --pentest    # additionally run the heavyweight pentest harness (boots a stack; ZAP leg needs Docker)
#   ./run_all_tests.sh --full       # everything: full suite + pentest + staging smoke (smoke SKIPs without AWS creds)
#   ./run_all_tests.sh --fail-fast  # stop at the first failing gate
#   ./run_all_tests.sh --help

set -euo pipefail
cd "$(dirname "$0")"

QUICK=0
WITH_SMOKE=0
PENTEST=0
FULL=0
# Set when smoke runs only because --full implied it (not an explicit
# --with-smoke). In that case missing staging credentials SKIP the smoke gate
# instead of failing the whole run, so --full is usable without an AWS profile.
SMOKE_OPTIONAL=0
# Set when the persona crawl runs only because --full implied it (not an explicit
# --with-persona-crawl). In that case an absent dev DB (a fixture-seeded clone with
# no operator dataset) SKIPs the gate instead of failing the run, so --full is
# usable by a developer or tester without the operator data handoff.
PERSONA_CRAWL_OPTIONAL=0
WITH_PERSONA_CRAWL=0
A11Y=0
FAIL_FAST=0
for arg in "$@"; do
  case "$arg" in
    --quick)              QUICK=1 ;;
    --with-smoke)         WITH_SMOKE=1 ;;
    --with-persona-crawl) WITH_PERSONA_CRAWL=1 ;;
    --a11y)               A11Y=1 ;;
    --pentest)            PENTEST=1 ;;
    --full)               FULL=1 ;;
    --fail-fast)          FAIL_FAST=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./run_all_tests.sh [--quick] [--with-smoke] [--with-persona-crawl] [--a11y] [--pentest] [--full] [--fail-fast]

Canonical local full-suite test runner. Runs the CI gates that are safe on a
workstation and summarizes the results.

Default (no flags): build, lint, audit, conventions, secret-scan, unit,
integration, e2e, terraform.

Options:
  --quick       Fast inner loop: skips e2e + terraform.
  --with-smoke  Additionally run the staging-AWS adapter smoke suite
                (npm run test:smoke). Requires RUN_STAGING_SMOKE=1 and a
                configured staging AWS profile; errors out otherwise.
  --with-persona-crawl
                Additionally run the David Leberknight dev-persona build-switch
                journey and page crawl (npm run test:persona-crawl) against an
                already-running dev stack. It needs the loaded pipeline database
                and the real image worker, so start ./run_dev.sh first; the gate
                errors out when the app is unreachable. Point it elsewhere with
                PERSONA_CRAWL_BASE_URL. Never runs in CI.
  --pentest     Additionally run the heavyweight pentest harness
                (npm run test:pentest:heavy). Boots a throwaway stack and runs
                the security-header walk, internal-route, and upload-abuse
                probes plus the Docker-gated OWASP ZAP baseline. Opt-in because
                it is slow and the ZAP leg needs Docker; CI does not run it.
  --full        Everything: the full suite plus --pentest, the staging-AWS smoke,
                and the persona crawl. Unlike --with-smoke, smoke SKIPs (rather
                than fails) when RUN_STAGING_SMOKE / AWS creds are absent, so
                --full runs end to end without an AWS profile. The persona crawl
                likewise SKIPs (with a warning) when the dev DB lacks the operator
                dataset (DL's HOF record + the Wellington club), so --full also
                completes for a developer or tester without the data handoff.
  --a11y        Additionally run the axe WCAG 2.1 AA accessibility scan of the
                high-traffic public pages (npm run test:e2e:a11y) against a
                throwaway browser stack. Opt-in because it boots the full e2e
                stack; the scan writes only to os.tmpdir().
  --fail-fast   Stop at the first failing gate instead of running them all.
  -h, --help    Show this message.

SAFE BY DESIGN: this runner never writes to legacy_data/ or curated/. It
excludes the db-load-smoke loader gate (CI-only; that gate writes legacy_data
fixtures and is safe only on an empty checkout) and fingerprints the real-data
trees before/after to prove nothing changed.

Not run here:
  - db-load-smoke (loader pipeline): runs in CI on every push (clean checkout).
  - test:smoke (live staging AWS): opt in with --with-smoke from the operator
    workstation.
  - test:pentest:heavy (heavyweight pentest): opt in with --pentest; boots a
    throwaway stack and the ZAP leg needs Docker.
USAGE
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

# --full is the kitchen sink: full mode plus every opt-in gate. Staging smoke is
# included but degrades to a SKIP when staging credentials are absent (see
# SMOKE_OPTIONAL), so --full runs end to end on a workstation without an AWS
# profile while still exercising everything that can run there. The persona crawl
# likewise degrades to a SKIP under --full (see PERSONA_CRAWL_OPTIONAL) when the dev
# DB lacks the operator dataset, so --full completes on a fixture-seeded clone too.
if (( FULL == 1 )); then
  QUICK=0
  WITH_SMOKE=1
  PENTEST=1
  SMOKE_OPTIONAL=1
  WITH_PERSONA_CRAWL=1
  PERSONA_CRAWL_OPTIONAL=1
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
need_cmd node "Install Node.js 22.x (see docs/DEV_ONBOARDING.md)."
need_cmd npm  "Install Node.js 22.x (npm ships with it)."
if [[ ! -d node_modules ]]; then
  echo "ERROR: node_modules/ is missing." >&2
  echo "Recommendation: run 'npm ci' first." >&2
  exit 1
fi

# Start from a clean slate: sweep the previous run's transient test/build
# artifacts before this run begins. Deliberately at the START, not the end, so
# this run's Playwright retain-on-failure traces survive for post-run debugging.
# clean_up_rubbish.sh touches no real-data tree, so it runs before the
# fingerprint snapshot below.
bash scripts/clean_up_rubbish.sh

# -----------------------------------------------------------------------------
# No-real-data guard. Fingerprint the trees that hold irreplaceable local data.
# The find segment tolerates its own non-zero exit (broken symlinks etc.) so a
# fingerprint is always produced under 'set -o pipefail'.
# -----------------------------------------------------------------------------
REAL_DATA_DIRS=(legacy_data curated)
fingerprint() {
  local dir="$1"
  if [[ -e "$dir" ]]; then
    { find "$dir" -printf '%T@ %s %p\n' 2>/dev/null || true; } | LC_ALL=C sort | sha256sum | awk '{print $1}'
  else
    echo "absent"
  fi
}
declare -A FP_BEFORE=()
for d in "${REAL_DATA_DIRS[@]}"; do FP_BEFORE["$d"]=$(fingerprint "$d"); done

assert_real_data_untouched() {
  local changed=0 d now
  for d in "${REAL_DATA_DIRS[@]}"; do
    now=$(fingerprint "$d")
    if [[ "$now" != "${FP_BEFORE[$d]}" ]]; then
      echo "FATAL: a gate modified '$d/' (real-data tree). This must never happen." >&2
      changed=1
    fi
  done
  if (( changed == 1 )); then
    echo "FATAL: run_all_tests.sh detected a write into a real-data tree. Investigate before trusting this run." >&2
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

# Per-gate output is tee'd here so failed gates can be re-shown at the end of a
# long run instead of forcing a scroll-back through thousands of lines. Lives in
# the OS tmpdir (never a real-data tree) and is removed on exit.
LOG_DIR=$(mktemp -d "${TMPDIR:-/tmp}/footbag-run-all.XXXXXX")
trap 'rm -rf "$LOG_DIR"' EXIT

summarize() {
  echo ""
  echo "=============================================="
  echo " run_all_tests.sh — summary"
  echo "=============================================="
  local i
  for i in "${!GATE_NAMES[@]}"; do
    printf '  %-14s %s\n' "${GATE_NAMES[$i]}" "${GATE_RESULTS[$i]}"
  done
  echo "=============================================="
  if (( ${#FAIL_LOGS[@]} > 0 )); then
    echo " FAILED gates (${#FAIL_LOGS[@]}): ${FAIL_LOGS[*]}"
    echo "=============================================="
  fi
}

# Re-show the tail of every failed gate's captured output so the actual error
# is at the end of the run, not buried thousands of lines up. The full output
# already streamed live above; this is the recap.
dump_failures() {
  (( ${#FAIL_LOGS[@]} == 0 )) && return 0
  echo ""
  echo "=============================================="
  echo " failure details (${#FAIL_LOGS[@]} gate(s); last 60 lines each)"
  echo "=============================================="
  local name log
  for name in "${FAIL_LOGS[@]}"; do
    log="${LOG_DIR}/${name}.log"
    echo ""
    echo "──── ${name} ────"
    if [[ -s "$log" ]]; then
      tail -n 60 "$log"
    else
      echo "  (no captured output)"
    fi
  done
  echo "=============================================="
}

# run_gate NAME CMD...   — a gate may return 77 to signal SKIP.
run_gate() {
  local name="$1"; shift
  echo ""
  echo "→ [${name}] running: $*"
  local rc=0 log="${LOG_DIR}/${name}.log"
  # tee keeps the live output while capturing it; PIPESTATUS[0] is the gate's
  # own exit code (not tee's). Toggle set -e so a failing gate does not abort
  # the whole pipeline before we record its result.
  set +e
  "$@" 2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  set -e
  GATE_NAMES+=("$name")
  if (( rc == 0 )); then
    GATE_RESULTS+=("PASS")
    echo "→ [${name}] PASS"
  elif (( rc == 77 )); then
    GATE_RESULTS+=("SKIP")
    echo "→ [${name}] SKIP"
  else
    GATE_RESULTS+=("FAIL (exit ${rc})")
    FAIL_LOGS+=("$name")
    ANY_FAIL=1
    echo "ERROR: [${name}] FAILED (exit ${rc})" >&2
    if (( FAIL_FAST == 1 )); then
      assert_real_data_untouched
      summarize
      dump_failures
      exit 1
    fi
  fi
}

# -----------------------------------------------------------------------------
# Compound / conditional gate bodies.
# -----------------------------------------------------------------------------
gate_terraform() {
  if ! command -v terraform >/dev/null 2>&1; then
    echo "  terraform CLI absent — skipping (CI's terraform job covers it)."
    return 77
  fi
  ( cd terraform && terraform fmt -check -recursive )
  local d
  for d in staging production shared; do
    ( cd "terraform/$d" && terraform init -backend=false >/dev/null && terraform validate >/dev/null )
  done
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
  npm run test:pentest:heavy
}

gate_persona_crawl() {
  # The DL persona is built against loaded pipeline data and the real image
  # worker. This gate boots the dev stack against the existing loaded dev DB,
  # runs the DL build-switch journey (media + onboarding), then tears the stack
  # down. The in-suite seeded-persona crawl runs separately in the integration
  # gate. Booting with no rebuild flag writes nothing under legacy_data/ or
  # curated/, so the real-data fingerprint guard stays satisfied.
  local base="${PERSONA_CRAWL_BASE_URL:-http://localhost:3000}"

  # Require a loaded DB carrying DL's data (his HOF record + the Wellington club);
  # the build-switch journey needs them. Absent → SKIP under --full, FAIL under an
  # explicit --with-persona-crawl.
  local have_db=0
  if [[ -f database/footbag.db ]] && command -v sqlite3 >/dev/null 2>&1; then
    local hof wel
    hof=$(sqlite3 database/footbag.db "SELECT COUNT(*) FROM historical_persons WHERE hof_member=1 AND person_name LIKE '%Leberknight%';" 2>/dev/null || echo 0)
    wel=$(sqlite3 database/footbag.db "SELECT COUNT(*) FROM clubs WHERE name LIKE '%Wellington%';" 2>/dev/null || echo 0)
    [[ "${hof}" != "0" && "${wel}" != "0" ]] && have_db=1
  fi
  if (( have_db == 0 )); then
    if (( PERSONA_CRAWL_OPTIONAL == 1 )); then
      echo "  WARNING: persona crawl needs a loaded dev DB (DL's HOF record + the Wellington club);" >&2
      echo "  a fixture-seeded clone has neither, so this gate is SKIPPED. Every other gate still runs." >&2
      echo "  To exercise it, load the operator data handoff, then run with --with-persona-crawl." >&2
      return 77
    fi
    echo "ERROR: persona crawl needs a loaded dev DB (DL's HOF record + the Wellington club)." >&2
    echo "Recommendation: bash scripts/reset-local-db.sh (or ./run_dev.sh --reset), then re-run." >&2
    return 1
  fi

  reclaim_port 3000
  reclaim_port 4001

  # Boot the dev stack (web + image worker) against the existing loaded DB. No
  # rebuild flag → no DB work. scripts/dev.sh installs a trap that kills both
  # children on SIGTERM, so signaling this PID cascades the shutdown; reclaim_port
  # is the backstop.
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
    echo "ERROR: dev stack did not become ready at ${base} within the timeout; see ${LOG_DIR}/persona-stack.log" >&2
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

gate_smoke() {
  if [[ "${RUN_STAGING_SMOKE:-}" != "1" ]]; then
    if (( SMOKE_OPTIONAL == 1 )); then
      echo "  staging smoke needs RUN_STAGING_SMOKE=1 + a staging AWS profile; skipping under --full."
      echo "  Recommendation: RUN_STAGING_SMOKE=1 ./run_all_tests.sh --full (from the operator workstation)."
      return 77
    fi
    echo "ERROR: --with-smoke requires RUN_STAGING_SMOKE=1 and a configured staging AWS profile." >&2
    echo "Recommendation: RUN_STAGING_SMOKE=1 ./run_all_tests.sh --with-smoke (from the operator workstation)." >&2
    return 1
  fi
  npm run test:smoke
}

# Secret scan, matching CI's gitleaks job. Uses the local gitleaks CLI when
# present, falls back to the dockerized scanner, and SKIPs when neither is
# available (CI still enforces it on every push).
gate_secret_scan() {
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks detect --source . --config .gitleaks.toml --no-banner
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
      detect --source /repo --config /repo/.gitleaks.toml --no-banner
  else
    echo "  gitleaks and docker both absent — skipping (CI's secret-scan job covers it)."
    return 77
  fi
}

# Dependency audit (audit-ci --moderate). A genuine moderate-or-higher advisory
# FAILs the gate. But audit-ci needs a live call to npm's registry audit
# endpoint; when that endpoint is unreachable (offline, degraded network, or a
# registry-side error) it retrieves no advisory data and aborts without checking
# anything. That case SKIPs rather than FAILs, the same way secret-scan and
# terraform SKIP when their tooling is unavailable, so a network hiccup does not
# masquerade as a hard failure. CI runs the audit on every push against a
# healthy network, so coverage is not lost.
gate_audit() {
  local out rc
  out=$(npm run audit 2>&1)
  rc=$?
  printf '%s\n' "$out"
  (( rc == 0 )) && return 0
  # Registry-unreachable signatures: audit-ci surfaces a failed/empty registry
  # response as "code undefined", and npm's own fetch errors carry the endpoint
  # or connection messages. None of these strings appear in a real advisory
  # report, so the match is conservative and never silences an actual finding.
  if printf '%s' "$out" | grep -qiE 'code undefined|audit endpoint returned an error|security/audits/[a-z]+ failed|request to .*registry.* failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed'; then
    echo ""
    echo "  audit SKIPPED: npm registry audit endpoint unreachable; no advisory"
    echo "  data was retrieved. Re-run when connectivity recovers. CI enforces"
    echo "  the audit on every push."
    return 77
  fi
  return "$rc"
}

# Legacy-data pipeline suite (pytest). Carries the only regression coverage for
# the member pipeline's production/staging refusal guards, the credential-header
# abort, claim-state preservation, and the loader exclusion rules — so it runs
# on every full local pass. Every test writes only to pytest tmp_path fixtures,
# but pytest itself would otherwise write into legacy_data/ (a .pytest_cache
# directory there, since its rootdir resolves to legacy_data, plus __pycache__
# bytecode), tripping the real-data fingerprint guard. PYTHONDONTWRITEBYTECODE
# suppresses the bytecode writes and -p no:cacheprovider disables the pytest
# cache, so the gate leaves legacy_data/ byte-for-byte untouched. Any change to
# this invocation must preserve that (verify with the fingerprint guard).
gate_python_pipeline() {
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  python3 absent — skipping."
    return 77
  fi
  if ! python3 -c "import pytest" >/dev/null 2>&1; then
    echo "  pytest not importable — skipping (pip install pytest to enable)."
    return 77
  fi
  PYTHONDONTWRITEBYTECODE=1 python3 -m pytest legacy_data/tests/ -q -p no:cacheprovider
}

# =============================================================================
# GATE SEQUENCE — ADD NEW SUITES HERE.
# Each line is one gate: `run_gate <label> <command...>`. To extend coverage as
# new test suites land, add a run_gate line (or a gate_* function above for
# compound gates) in the right place. Keep every gate SAFE: it must write only
# to os.tmpdir()/mktemp, never to legacy_data/ or curated/.
# =============================================================================
echo "→ run_all_tests.sh starting (mode: $( (( QUICK )) && echo quick || echo full )$( (( WITH_SMOKE )) && echo +smoke || true )$( (( PENTEST )) && echo +pentest || true ))"

run_gate build       npm run build
run_gate lint        npm run lint
run_gate audit       gate_audit
run_gate conventions bash scripts/ci/assert_conventions.sh
run_gate secret-scan gate_secret_scan
run_gate unit        npm run test:unit
run_gate integration npm run test:integration
run_gate python-pipeline gate_python_pipeline

if (( QUICK == 0 )); then
  run_gate e2e        gate_e2e
  run_gate terraform  gate_terraform
fi

if (( WITH_SMOKE == 1 )); then
  run_gate smoke      gate_smoke
fi

if (( WITH_PERSONA_CRAWL == 1 )); then
  run_gate persona-crawl gate_persona_crawl
fi

if (( A11Y == 1 )); then
  run_gate a11y       gate_a11y
fi

if (( PENTEST == 1 )); then
  run_gate pentest    gate_pentest
fi

# db-load-smoke (loader pipeline) is intentionally absent: it writes legacy_data
# fixtures and is safe only on a clean checkout. CI runs it on every push.

assert_real_data_untouched
summarize
dump_failures

if (( ANY_FAIL == 1 )); then
  echo "→ run_all_tests.sh: one or more gates FAILED." >&2
  exit 1
fi
echo "→ run_all_tests.sh: all gates passed."

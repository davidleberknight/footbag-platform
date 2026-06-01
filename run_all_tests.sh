#!/usr/bin/env bash
# run_all_tests.sh — canonical local full-suite test runner.
#
# Runs every CI gate that is SAFE to run on a developer workstation: type-check,
# convention gate, unit + integration (vitest), e2e (Playwright), and terraform
# fmt/validate. Prints a per-gate pass/fail summary and exits non-zero if any
# gate fails.
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
#
# Usage:
#   ./run_all_tests.sh              # full safe suite: build, conventions, unit, integration, e2e, terraform
#   ./run_all_tests.sh --quick      # fast loop: build, conventions, unit, integration (skips e2e + terraform)
#   ./run_all_tests.sh --with-smoke # additionally run the staging-AWS smoke suite (needs RUN_STAGING_SMOKE=1)
#   ./run_all_tests.sh --fail-fast  # stop at the first failing gate
#   ./run_all_tests.sh --help

set -euo pipefail
cd "$(dirname "$0")"

QUICK=0
WITH_SMOKE=0
FAIL_FAST=0
for arg in "$@"; do
  case "$arg" in
    --quick)      QUICK=1 ;;
    --with-smoke) WITH_SMOKE=1 ;;
    --fail-fast)  FAIL_FAST=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./run_all_tests.sh [--quick] [--with-smoke] [--fail-fast]

Canonical local full-suite test runner. Runs the CI gates that are safe on a
workstation and summarizes the results.

Default (no flags): build, conventions, unit, integration, e2e, terraform.

Options:
  --quick       Fast inner loop: build, conventions, unit, integration only
                (skips e2e + terraform).
  --with-smoke  Additionally run the staging-AWS adapter smoke suite
                (npm run test:smoke). Requires RUN_STAGING_SMOKE=1 and a
                configured staging AWS profile; errors out otherwise.
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
USAGE
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

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
ANY_FAIL=0

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
}

# run_gate NAME CMD...   — a gate may return 77 to signal SKIP.
run_gate() {
  local name="$1"; shift
  echo ""
  echo "→ [${name}] running: $*"
  local rc=0
  "$@" || rc=$?
  GATE_NAMES+=("$name")
  if (( rc == 0 )); then
    GATE_RESULTS+=("PASS")
    echo "→ [${name}] PASS"
  elif (( rc == 77 )); then
    GATE_RESULTS+=("SKIP")
    echo "→ [${name}] SKIP"
  else
    GATE_RESULTS+=("FAIL (exit ${rc})")
    ANY_FAIL=1
    echo "ERROR: [${name}] FAILED (exit ${rc})" >&2
    if (( FAIL_FAST == 1 )); then
      assert_real_data_untouched
      summarize
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

gate_smoke() {
  if [[ "${RUN_STAGING_SMOKE:-}" != "1" ]]; then
    echo "ERROR: --with-smoke requires RUN_STAGING_SMOKE=1 and a configured staging AWS profile." >&2
    echo "Recommendation: RUN_STAGING_SMOKE=1 ./run_all_tests.sh --with-smoke (from the operator workstation)." >&2
    return 1
  fi
  npm run test:smoke
}

# =============================================================================
# GATE SEQUENCE — ADD NEW SUITES HERE.
# Each line is one gate: `run_gate <label> <command...>`. To extend coverage as
# new test suites land, add a run_gate line (or a gate_* function above for
# compound gates) in the right place. Keep every gate SAFE: it must write only
# to os.tmpdir()/mktemp, never to legacy_data/ or curated/.
# =============================================================================
echo "→ run_all_tests.sh starting (mode: $( (( QUICK )) && echo quick || echo full )$( (( WITH_SMOKE )) && echo +smoke || true ))"

run_gate build       npm run build
run_gate conventions bash scripts/ci/assert_conventions.sh
run_gate unit        npm run test:unit
run_gate integration npm run test:integration

if (( QUICK == 0 )); then
  run_gate e2e        gate_e2e
  run_gate terraform  gate_terraform
fi

if (( WITH_SMOKE == 1 )); then
  run_gate smoke      gate_smoke
fi

# db-load-smoke (loader pipeline) is intentionally absent: it writes legacy_data
# fixtures and is safe only on a clean checkout. CI runs it on every push.

assert_real_data_untouched
summarize

if (( ANY_FAIL == 1 )); then
  echo "→ run_all_tests.sh: one or more gates FAILED." >&2
  exit 1
fi
echo "→ run_all_tests.sh: all gates passed."

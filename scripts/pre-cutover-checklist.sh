#!/usr/bin/env bash
# scripts/pre-cutover-checklist.sh -- pre-cutover preflight orchestrator.
#
# Runs the snapshot capture, the validation-gate scripts in dependency
# order, the dev-shortcut audit, the DNS TTL preflight, and the
# smoke/e2e test suites. Aggregates each script's GATE: line into a
# summary block; exits non-zero if any gate fails.
#
# Operator runs this as the final preflight before issuing the cutover
# go signal. The orchestrator is dry-run friendly: AWS-touching scripts
# accept --mock so the checklist can be exercised end-to-end on a fresh
# clone before any real cutover.
#
# Env vars:
#   FOOTBAG_DB_PATH                  path to SQLite db (default: ./database/footbag.db)
#   FOOTBAG_SNAPSHOT_DIR             snapshot output dir
#   FOOTBAG_LEGACY_HOSTED_ZONE_ID    Route 53 zone (required if not --mock-aws)
#   FOOTBAG_PRECUTOVER_MOCK_AWS=1    skip AWS calls (equivalent to --mock-aws)
#   FOOTBAG_PRECUTOVER_SKIP_TESTS=1  skip npm run test:smoke / test:e2e
#
# Flags:
#   --mock-aws     run DNS TTL + SES smoke in mock mode (no AWS calls)
#   --skip-tests   skip the smoke + e2e suites
#
# Exit codes:
#   0  all gates PASS
#   1  one or more gates FAIL
#   2  invalid invocation

set -uo pipefail
cd "$(dirname "$0")/.."

MOCK_AWS=0
SKIP_TESTS=0
[[ "${FOOTBAG_PRECUTOVER_MOCK_AWS:-0}" == "1" ]] && MOCK_AWS=1
[[ "${FOOTBAG_PRECUTOVER_SKIP_TESTS:-0}" == "1" ]] && SKIP_TESTS=1
for arg in "$@"; do
  case "${arg}" in
    --mock-aws)   MOCK_AWS=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    *) echo "unknown arg: ${arg}" >&2; exit 2 ;;
  esac
done

results=()
fail=0

run_step() {
  local label="$1"; shift
  local out rc
  out=$("$@" 2>&1) || rc=$? && rc=${rc:-0}
  # Extract the last GATE: line for the summary if present; otherwise
  # synthesize one from the exit code so every step contributes a row.
  local summary
  summary=$(printf '%s\n' "${out}" | grep -E '^GATE:' | tail -1 || true)
  if [[ -z "${summary}" ]]; then
    if [[ "${rc}" -eq 0 ]]; then
      summary="GATE: ${label} PASS: ok"
    else
      summary="GATE: ${label} FAIL: exit ${rc}"
    fi
  fi
  results+=("${summary}")
  # Stream the full step output so operators see context inline.
  printf -- '--- %s (exit %d) ---\n%s\n' "${label}" "${rc}" "${out}"
  [[ "${rc}" -ne 0 ]] && fail=$((fail + 1))
  return 0
}

# 1. Snapshot
run_step "SNAPSHOT" bash scripts/take-pre-cutover-snapshot.sh

# 2. G1-G6: legacy import gates
run_step "G1-G6" bash scripts/validate-legacy-import-gates.sh

# 3. G7: club candidates
run_step "G7" bash scripts/validate-club-candidates.sh

# 4. G8: bootstrap leaders
run_step "G8" bash scripts/validate-bootstrap-leaders.sh

# 5. G6-tiers (explicit tier-mapping check, narrower than G1-G6 above)
run_step "G6-tiers" bash scripts/validate-legacy-tiers.sh

# 6. G11: name variants
run_step "G11" bash scripts/validate-name-variants.sh

# 7. Claim-safety integration suite + smoke/e2e. The integration suite
# re-runs the claim-flow safety gates (anti-enumeration, rate limiting,
# claim and auto-link, mailbox-control round-trip, admin help-request)
# against the shipped working tree, since a deploy ships the working tree,
# not a committed SHA, so a green CI run on a commit does not certify this
# artifact. G9 + G10 are exercised by the smoke suite. All three are
# skipped under --skip-tests for local dry runs and the orchestrator's own
# hermetic test, which would otherwise recurse through the integration
# suite.
if [[ "${SKIP_TESTS}" -eq 0 ]]; then
  run_step "CLAIM-SAFETY" npm run test:integration
  run_step "SMOKE" npm run test:smoke
  run_step "E2E"   npm run test:e2e
else
  results+=("GATE: CLAIM-SAFETY SKIP: --skip-tests passed")
  results+=("GATE: SMOKE SKIP: --skip-tests passed")
  results+=("GATE: E2E SKIP: --skip-tests passed")
fi

# 8. Dev-admin-shortcut audit (must be clean before production)
run_step "DEV-ADMIN-AUDIT" bash scripts/audit-dev-shortcuts.sh

# 8a. Permanent showcase event + Footbag Hacky persona must be present
run_step "SHOWCASE-PRESENCE" bash scripts/validate-showcase-presence.sh

# 9. G20 data-review sign-off: the historical-pipeline maintainer's audit
#    row confirming legacy data is complete and member-list presentation is
#    reviewed. Legacy-data surfaces must not ship without it.
run_step "G20-SIGNOFF" bash -c '
  count=$(sqlite3 "${FOOTBAG_DB_PATH:-./database/footbag.db}" \
    "SELECT COUNT(*) FROM audit_entries WHERE action_type = '"'"'legacy_pipeline.data_review_signoff'"'"';")
  if [ "${count}" -ge 1 ]; then
    echo "GATE: G20-SIGNOFF PASS: data-review sign-off audit row present"
  else
    echo "GATE: G20-SIGNOFF FAIL: no legacy_pipeline.data_review_signoff audit row; withhold legacy-data surfaces until the maintainer signs off" >&2
    exit 1
  fi
'

# 10. Live-payments boot readiness (env file names the live adapter and the
#    webhook secret; the Stripe key itself lives in SSM)
run_step "PAYMENTS-BOOT" bash scripts/validate-payments-boot.sh

# 11. Internal QC subsystem must be absent from the production image
if [[ "${MOCK_AWS}" -eq 1 ]]; then
  run_step "QC-ABSENCE" bash scripts/validate-qc-absence.sh --mock
else
  run_step "QC-ABSENCE" bash scripts/validate-qc-absence.sh
fi

# NOTE: no DNS step here. The go-live flip is the webmaster's manual switch
# of apex/www on his own authoritative zone, including its T-48h TTL
# pre-shrink — his manual actions, not steps this script runs.
# scripts/dns-ttl-preflight.sh --phase handover applies only at the later,
# optional Route 53 handover milestone. The email-day MX/TXT TTL pre-shrink
# is likewise the webmaster's manual action on his authoritative zone.

echo
echo "=== pre-cutover summary ==="
for line in "${results[@]}"; do
  echo "${line}"
done
echo "==========================="

if [[ "${fail}" -eq 0 ]]; then
  echo "READY: all gates PASS"
  exit 0
else
  echo "BLOCKED: ${fail} gate(s) FAIL" >&2
  exit 1
fi

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
#   FOOTBAG_PRECUTOVER_EMAIL_PROFILE     AWS profile for the live outbox smoke (step 8a)
#   FOOTBAG_PRECUTOVER_EMAIL_HOST_ALIAS  deploy ssh alias for the outbox smoke
#   FOOTBAG_PRECUTOVER_EMAIL_CREDFILE    operator credential file (sudo password line 1)
#   FOOTBAG_PRECUTOVER_EMAIL_INBOX       optional real inbox for the outbox smoke
#
# Flags:
#   --mock-aws     run the DNS TTL and QC gates in mock mode (no AWS calls, and
#                  the DNS gate then proves nothing about the zone)
#   --skip-tests   skip the smoke + e2e suites
#   --target <env> certify a deployed environment rather than this workstation.
#                  Without it every data gate reads ./database/footbag.db, which
#                  is the operator's own build -- fine for a rehearsal, and the
#                  wrong thing entirely for a run whose output is read as
#                  "production is ready". With it, the snapshot is taken on the
#                  host against the live database and pulled back, and every
#                  later data gate reads that artifact. The gates then attest to
#                  exactly the object the rollback would restore.
#
#                  Needs the operator credential file on stdin, the same way
#                  every other script that opens a privileged session does:
#                    < ~/AWS/AWS_OPERATOR_PRODUCTION.txt \
#                        bash scripts/pre-cutover-checklist.sh --target production
#
# Exit codes:
#   0  no gate failed. The final line distinguishes the two ways that happens:
#      every gate passed, or some gate skipped its work and did not look.
#   1  one or more gates FAIL
#   2  invalid invocation

set -uo pipefail
cd "$(dirname "$0")/.."

MOCK_AWS=0
SKIP_TESTS=0
TARGET=""
[[ "${FOOTBAG_PRECUTOVER_MOCK_AWS:-0}" == "1" ]] && MOCK_AWS=1
[[ "${FOOTBAG_PRECUTOVER_SKIP_TESTS:-0}" == "1" ]] && SKIP_TESTS=1
while [[ $# -gt 0 ]]; do
  case "${1}" in
    --mock-aws)   MOCK_AWS=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --target)     shift; TARGET="${1:-}" ;;
    *) echo "unknown arg: ${1}" >&2; exit 2 ;;
  esac
  shift
done

case "${TARGET}" in
  "" ) ;;
  staging|production) ;;
  *) echo "--target must be 'staging' or 'production' (got '${TARGET}')" >&2; exit 2 ;;
esac

# --target and --mock-aws are contradictory in the one way that matters: the
# point of naming a target is that the run attests to something real, and mock
# mode is how a run attests to nothing. Allowing both would produce a report
# headed "production" whose gates never looked at production.
if [[ -n "${TARGET}" && "${MOCK_AWS}" -eq 1 ]]; then
  echo "--target ${TARGET} and --mock-aws are mutually exclusive: a mocked run" >&2
  echo "  certifies nothing, and labelling it with an environment name is how a" >&2
  echo "  rehearsal gets read as a readiness result." >&2
  exit 2
fi

results=()
fail=0

# ── Where the data gates read from ───────────────────────────────────────────
# Set for the whole run, before any gate. Without --target this is the
# workstation build and the summary says so; with it, this becomes the snapshot
# pulled back from the host, so every gate reads the deployed data.
GATE_DB="${FOOTBAG_DB_PATH:-./database/footbag.db}"
SNAPSHOT_URI=""
PULLED_DB=""

cleanup_pulled_db() {
  # The pulled artifact is a copy of the production member database. It exists
  # only for the length of this run and is removed on every exit path, including
  # a failed gate, rather than left in a temp directory for whatever comes next.
  [[ -n "${PULLED_DB}" && -d "${PULLED_DB}" ]] && rm -rf "${PULLED_DB}"
  return 0
}
trap cleanup_pulled_db EXIT

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

# 1. Snapshot. Without a target this is the workstation build; with one it runs
#    on the host against the live database, and the artifact it produces becomes
#    what every later data gate reads.
if [[ -z "${TARGET}" ]]; then
  run_step "SNAPSHOT" bash scripts/take-pre-cutover-snapshot.sh
else
  SSH_ALIAS="footbag-${TARGET}"
  REMOTE_HALF="scripts/internal/take-pre-cutover-snapshot-remote.sh"
  # shellcheck source=scripts/lib/host-env-remote.sh
  source scripts/lib/host-env-remote.sh
  require_operator_stdin "scripts/pre-cutover-checklist.sh --target ${TARGET}" || exit 1
  require_ssh_alias "${SSH_ALIAS}" || exit 1
  require_host_ssh_opts || exit 1
  [[ -r "${REMOTE_HALF}" ]] || { echo "missing remote half: ${REMOTE_HALF}" >&2; exit 1; }

  DR_BUCKET="${FOOTBAG_DR_BUCKET:-footbag-${TARGET}-db-snapshots-dr}"
  remote_snapshot() {
    {
      printf '%s\n' "${SUDO_PASS}"
      printf 'DR_BUCKET=%q\n' "${DR_BUCKET}"
      cat "${REMOTE_HALF}"
    } | ssh "${HOST_SSH_OPTS[@]}" "${SSH_ALIAS}" 'sudo -k -S -p "" bash'
  }
  SNAPSHOT_OUT="$(remote_snapshot 2>&1)" && SNAPSHOT_RC=0 || SNAPSHOT_RC=$?
  printf -- '--- SNAPSHOT (host %s, exit %d) ---\n%s\n' "${SSH_ALIAS}" "${SNAPSHOT_RC}" "${SNAPSHOT_OUT}"

  SNAPSHOT_URI="$(printf '%s' "${SNAPSHOT_OUT}" | sed -n 's/^PRECUTOVER_SNAPSHOT_URI=//p' | tail -1)"
  if [[ "${SNAPSHOT_RC}" -ne 0 || -z "${SNAPSHOT_URI}" ]]; then
    results+=("GATE: SNAPSHOT FAIL: the host snapshot did not complete; nothing was pulled back")
    fail=$((fail + 1))
  else
    # Pull the exact object the host just uploaded, by key. Not "the newest
    # thing under the prefix": that is a search, and a search can select an
    # artifact from a different run while reporting success.
    PULLED_DB="$(mktemp -d)"
    if aws s3 cp --only-show-errors "${SNAPSHOT_URI}" "${PULLED_DB}/snapshot.db.gz" \
       && gunzip -f "${PULLED_DB}/snapshot.db.gz"; then
      GATE_DB="${PULLED_DB}/snapshot.db"
      export FOOTBAG_DB_PATH="${GATE_DB}"
      results+=("GATE: SNAPSHOT PASS: ${TARGET} snapshot taken on the host and pulled back (${SNAPSHOT_URI})")
    else
      results+=("GATE: SNAPSHOT FAIL: ${SNAPSHOT_URI} could not be pulled back or did not decompress")
      fail=$((fail + 1))
    fi
  fi
fi

# 2. G1-G6: legacy import gates
run_step "G1-G6" bash scripts/validate-legacy-import-gates.sh

# 3. G7: club candidates
run_step "G7" bash scripts/validate-club-candidates.sh

# 4. G8: bootstrap leaders
run_step "G8" bash scripts/validate-bootstrap-leaders.sh

# 5. G11: name variants
run_step "G11" bash scripts/validate-name-variants.sh

# 6. Claim-safety integration suite + smoke/e2e. The integration suite
# re-runs the claim-flow safety gates (anti-enumeration, rate limiting,
# claim and auto-link, mailbox-control round-trip, admin help-request)
# against the shipped working tree, since a deploy ships the working tree,
# not a committed SHA, so a green CI run on a commit does not certify this
# artifact. The smoke suite adds G10's enqueue-and-drain logic against the
# stub adapter, and nothing of G9: it sends through the SES adapter to the
# simulator and renders no club page, so whether bootstrapped clubs produce
# valid pages is proved elsewhere and never here. The live half of G10 is
# step 8a below. All three are skipped under --skip-tests for local dry runs
# and the orchestrator's own hermetic test, which would otherwise recurse
# through the integration suite.
if [[ "${SKIP_TESTS}" -eq 0 ]]; then
  run_step "CLAIM-SAFETY" npm run test:integration
  run_step "SMOKE" npm run test:smoke
  run_step "E2E"   npm run test:e2e
else
  results+=("GATE: CLAIM-SAFETY SKIP: --skip-tests passed")
  results+=("GATE: SMOKE SKIP: --skip-tests passed")
  results+=("GATE: E2E SKIP: --skip-tests passed")
fi

# 7. Dev-admin-shortcut audit (must be clean before production)
run_step "DEV-ADMIN-AUDIT" bash scripts/audit-dev-shortcuts.sh

# 7a. Permanent showcase event + Footbag Hacky persona must be present
run_step "SHOWCASE-PRESENCE" bash scripts/validate-showcase-presence.sh

# NOTE: the data-review sign-off is not asserted here. It is a human
# coordination contract between the maintainers, confirmed and tracked with the
# rest of the pipeline work, not a state this script can read. Checklist state
# is not kept in the database.

# 8. Live-payments boot readiness (env file names the live adapter and the
#    webhook secret; the Stripe key itself lives in SSM)
run_step "PAYMENTS-BOOT" bash scripts/validate-payments-boot.sh

# 8a. Live outbox send-path smoke (gate G10): enqueue through the application
#     path on the production host, worker drains to live SES, inbox confirms.
#     Opt-in, because it sends real email and opens a privileged remote
#     session: it runs only when the operator supplies the email env set below;
#     otherwise it reports SKIP so a dry run stays hermetic. The inbox is
#     optional (the smoke defaults to the SES success simulator).
if [[ "${MOCK_AWS}" -eq 0 && -n "${FOOTBAG_PRECUTOVER_EMAIL_PROFILE:-}" \
      && -n "${FOOTBAG_PRECUTOVER_EMAIL_HOST_ALIAS:-}" \
      && -n "${FOOTBAG_PRECUTOVER_EMAIL_CREDFILE:-}" ]]; then
  run_step "G10-OUTBOX" bash -c \
    'bash scripts/verify-prod-email.sh --profile "$1" --confirm-production --host-alias "$2" ${3:+--inbox "$3"} < "$4"' _ \
    "${FOOTBAG_PRECUTOVER_EMAIL_PROFILE}" \
    "${FOOTBAG_PRECUTOVER_EMAIL_HOST_ALIAS}" \
    "${FOOTBAG_PRECUTOVER_EMAIL_INBOX:-}" \
    "${FOOTBAG_PRECUTOVER_EMAIL_CREDFILE}"
else
  results+=("GATE: G10-OUTBOX SKIP: set FOOTBAG_PRECUTOVER_EMAIL_PROFILE, FOOTBAG_PRECUTOVER_EMAIL_HOST_ALIAS and FOOTBAG_PRECUTOVER_EMAIL_CREDFILE (optionally FOOTBAG_PRECUTOVER_EMAIL_INBOX) to run the live outbox smoke")
fi

# 9. Internal QC subsystem must be absent from the production image
if [[ "${MOCK_AWS}" -eq 1 ]]; then
  run_step "QC-ABSENCE" bash scripts/validate-qc-absence.sh --mock
else
  run_step "QC-ABSENCE" bash scripts/validate-qc-absence.sh
fi

# 10. DNS TTL observed from the zone's own nameservers ahead of the apex/www flip.
#     The flip is operator-executed on Route 53 through Terraform, so this gate is
#     ours and belongs in the aggregator rather than in anyone's head. It reads
#     and never writes: Terraform already owns the TTL in both states.
if [[ "${MOCK_AWS}" -eq 1 ]]; then
  run_step "DNS-TTL" bash scripts/dns-ttl-preflight.sh --phase handover --mock
else
  run_step "DNS-TTL" bash scripts/dns-ttl-preflight.sh --phase handover
fi

# NOTE: the email-day MX and apex-TXT TTL is a separate, earlier shrink on the
# same zone and is not checked here; the apex MX TTL is a day as served today, so
# it has to lead the MX flip by at least that.

echo
echo "=== pre-cutover summary ==="
# Name the subject before listing the verdicts. Every data gate below reads one
# database, and which one it was is the difference between a readiness result
# and a rehearsal. Stating it here means a report pasted into a cutover log
# carries its own scope, rather than depending on the reader knowing which flags
# the run was given.
if [[ -n "${TARGET}" ]]; then
  echo "subject: ${TARGET}, via the snapshot taken on the host and pulled back"
  echo "         ${SNAPSHOT_URI:-(no artifact; the snapshot step failed)}"
else
  echo "subject: this workstation's own build at ${GATE_DB}"
  echo "         NOT a deployed environment. Re-run with --target production to"
  echo "         certify production."
fi
for line in "${results[@]}"; do
  echo "${line}"
done
echo "==========================="

# A gate that skipped its work is not a gate that passed, and the summary must
# not read as though it were. The mock DNS lookup is the live case: it performs
# no query at all, so a run that reports every gate green while one of them never
# looked is exactly the reassurance this checklist exists to withhold.
skipped=0
for line in "${results[@]}"; do
  case "${line}" in *" SKIPPED:"*|*" SKIP:"*) skipped=$((skipped + 1)) ;; esac
done

if [[ "${fail}" -eq 0 && "${skipped}" -eq 0 ]]; then
  echo "READY: all gates PASS"
  exit 0
elif [[ "${fail}" -eq 0 ]]; then
  echo "READY WITH GAPS: gates PASS, but ${skipped} did no work (see SKIP lines above)"
  exit 0
else
  echo "BLOCKED: ${fail} gate(s) FAIL" >&2
  exit 1
fi

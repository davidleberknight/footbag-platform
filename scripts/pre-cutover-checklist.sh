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
#   FOOTBAG_SNAPSHOT_LOCAL_ONLY=1    the snapshot step keeps its artifact local
#                                    instead of uploading to the cross-region DR
#                                    bucket. A rehearsal needs this: --mock-aws
#                                    does not reach the snapshot step, which
#                                    refuses rather than upload nowhere, so a
#                                    mocked run without it stops at gate one.
#   FOOTBAG_ENV_FILE                 deploy env file the payments-boot gate reads
#                                    (default /srv/footbag/env, absent on a
#                                    workstation; point it at a fixture to
#                                    rehearse that gate)
#
# So the whole-orchestrator rehearsal, which touches no AWS and no host, is:
#   FOOTBAG_SNAPSHOT_LOCAL_ONLY=1 FOOTBAG_ENV_FILE=<fixture> \
#     bash scripts/pre-cutover-checklist.sh --mock-aws --skip-tests
# Both variables are listed here because the two gates that need them are the
# first and the second-to-last in the sequence, and a rehearsal that stops at
# gate one teaches an operator to read past the summary it exists to produce.
#   FOOTBAG_PRECUTOVER_EMAIL_PROFILE     AWS profile for the live outbox smoke (step 8a)
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
#                  host against the live database, and every data gate runs on
#                  the host against that snapshot: the check scripts travel to
#                  the data, only their verdicts come back, and no copy of the
#                  database ever reaches this workstation. The gates then attest
#                  to exactly the object the rollback would restore.
#
#                  Needs the credential file on stdin, the same way every other
#                  script that opens a privileged session does. Which file that
#                  is follows the account the alias connects as, and production
#                  is reached only as the shared footbag account, which reads
#                  the file below. A run started without the redirect names
#                  the one it needs.
#                    < ~/AWS/AWS_OPERATOR_PRODUCTION.txt \
#                        bash scripts/pre-cutover-checklist.sh --target production
#   --no-snapshot  with --target only: take no snapshot and run the data gates on
#                  the host against the live database, read-only. For a check
#                  before cutover day, when writing a rollback artifact into the
#                  object-locked pre-flip prefix would be wrong. The summary
#                  reports the snapshot step as skipped.
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
NO_SNAPSHOT=0
TARGET=""
[[ "${FOOTBAG_PRECUTOVER_MOCK_AWS:-0}" == "1" ]] && MOCK_AWS=1
[[ "${FOOTBAG_PRECUTOVER_SKIP_TESTS:-0}" == "1" ]] && SKIP_TESTS=1
while [[ $# -gt 0 ]]; do
  case "${1}" in
    --mock-aws)   MOCK_AWS=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --no-snapshot) NO_SNAPSHOT=1 ;;
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

if [[ "${NO_SNAPSHOT}" -eq 1 && -z "${TARGET}" ]]; then
  echo "--no-snapshot applies only with --target: without one there is no host to read." >&2
  exit 2
fi

# A run that names a target reaches the host and AWS, so the identity it will
# use is settled and proved here rather than discovered
# in the middle of a gate, where a credential failure reads as a failed gate. A
# mocked run, and a run with no target, attest to nothing outside this
# workstation and need no credential at all.
if [[ -n "${TARGET}" && "${MOCK_AWS}" -eq 0 ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/aws-profile.sh"
  aws_profile_ensure || exit 1
fi

results=()
fail=0

# ── Where the data gates read from ───────────────────────────────────────────
# Without --target the gates read the workstation build and the summary says so.
# With it they run on the host, against the snapshot this run took there or,
# with --no-snapshot, the live database read-only; nothing comes back but their
# verdicts.
GATE_DB="${FOOTBAG_DB_PATH:-./database/footbag.db}"
SNAPSHOT_URI=""
SNAPSHOT_PATH=""
SNAPSHOT_SHA256=""
HOST_SUBJECT=""
PAYMENTS_ENV_DIR=""

cleanup_run_artifacts() {
  # The fetched env file is the host's entire secret set. It exists only for the
  # length of this run and is shredded on every exit path, including a failed
  # gate, rather than left in a temp directory for whatever comes next.
  if [[ -n "${PAYMENTS_ENV_DIR}" && -d "${PAYMENTS_ENV_DIR}" ]]; then
    find "${PAYMENTS_ENV_DIR}" -type f -exec shred -u {} + 2>/dev/null || true
    rm -rf "${PAYMENTS_ENV_DIR}"
  fi
  return 0
}
trap cleanup_run_artifacts EXIT

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
  require_operator_stdin "scripts/pre-cutover-checklist.sh --target ${TARGET}" \
    "${SSH_ALIAS}" "${TARGET}" || exit 1
  require_ssh_alias "${SSH_ALIAS}" || exit 1
  require_host_ssh_opts || exit 1
  require_host_is "${SSH_ALIAS}" "${TARGET}" || exit 1
  [[ -r "${REMOTE_HALF}" ]] || { echo "missing remote half: ${REMOTE_HALF}" >&2; exit 1; }

  # Derived from the target and from nothing else, so the snapshot lands in the
  # disaster-recovery bucket of the environment the host just confirmed it is.
  DR_BUCKET="footbag-${TARGET}-db-snapshots-dr"
  remote_snapshot() {
    {
      printf '%s\n' "${SUDO_PASS}"
      printf 'DR_BUCKET=%q\n' "${DR_BUCKET}"
      cat "${REMOTE_HALF}"
    } | ssh "${HOST_SSH_OPTS[@]}" "${SSH_ALIAS}" 'sudo -k -S -p "" bash'
  }
  if [[ "${NO_SNAPSHOT}" -eq 1 ]]; then
    HOST_SUBJECT="live"
    results+=("GATE: SNAPSHOT SKIP: --no-snapshot passed; the data gates read the live ${TARGET} database read-only and no rollback artifact was written")
  else
    SNAPSHOT_OUT="$(remote_snapshot 2>&1)" && SNAPSHOT_RC=0 || SNAPSHOT_RC=$?
    printf -- '--- SNAPSHOT (host %s, exit %d) ---\n%s\n' "${SSH_ALIAS}" "${SNAPSHOT_RC}" "${SNAPSHOT_OUT}"

    SNAPSHOT_URI="$(printf '%s' "${SNAPSHOT_OUT}" | sed -n 's/^PRECUTOVER_SNAPSHOT_URI=//p' | tail -1)"
    SNAPSHOT_PATH="$(printf '%s' "${SNAPSHOT_OUT}" | sed -n 's/^PRECUTOVER_SNAPSHOT_PATH=//p' | tail -1)"
    SNAPSHOT_SHA256="$(printf '%s' "${SNAPSHOT_OUT}" | sed -n 's/^PRECUTOVER_SNAPSHOT_SHA256=//p' | tail -1)"
    if [[ "${SNAPSHOT_RC}" -ne 0 || -z "${SNAPSHOT_URI}" || -z "${SNAPSHOT_PATH}" || -z "${SNAPSHOT_SHA256}" ]]; then
      results+=("GATE: SNAPSHOT FAIL: the host snapshot did not complete, so the data gates have no subject")
      fail=$((fail + 1))
    else
      HOST_SUBJECT="snapshot"
      results+=("GATE: SNAPSHOT PASS: ${TARGET} snapshot taken on the host (${SNAPSHOT_URI})")
    fi
  fi
fi

# 2-5 and 7. The data gates. With a target they run on the host in one session,
# against the subject chosen above, and only their verdicts come back: the
# check scripts travel to the data, never the data to the checks. Without a
# subject (the snapshot failed) they report FAIL and never fall back to a
# database on this workstation, which would certify the wrong thing under the
# target's heading.
DATA_CHECKS=(
  "G1_6:G1-G6:scripts/validate-legacy-import-gates.sh"
  "CLUBS:G7:scripts/validate-club-candidates.sh"
  "LEADERS:G8:scripts/validate-bootstrap-leaders.sh"
  "VARIANTS:G11:scripts/validate-name-variants.sh"
  "AUDIT:DEV-ADMIN-AUDIT:scripts/audit-dev-shortcuts.sh"
  "SHOWCASE:SHOWCASE-PRESENCE:scripts/validate-showcase-presence.sh"
)
# Every line kept from the host must be one of these shapes; anything else the
# host said is dropped unprinted.
# The reason is held to printable text with no '@', so neither an address nor a
# terminal escape sequence can ride in on a line that otherwise looks like a gate.
HOST_GATE_RE='^GATE: (G[1-9]|G1[1-3]|G1-G6|DEV-ADMIN-AUDIT|SHOWCASE-PRESENCE) (PASS|FAIL): [^[:cntrl:]@]+$'
HOST_RC_RE='^DG_(G1_6|CLUBS|LEADERS|VARIANTS|AUDIT|SHOWCASE)_RC=([0-9]+)$'

run_host_data_gates() {
  local reply rc=0 line entry label fallback
  local -A seen_rc=()
  reply="$(
    {
      printf '%s\n' "${SUDO_PASS}"
      printf 'DG_SUBJECT=%q\n' "${HOST_SUBJECT}"
      printf 'DG_SNAPSHOT_PATH=%q\n' "${SNAPSHOT_PATH}"
      printf 'DG_SNAPSHOT_SHA256=%q\n' "${SNAPSHOT_SHA256}"
      for entry in "${DATA_CHECKS[@]}"; do
        printf 'DG_%s_B64=%q\n' "${entry%%:*}" "$(base64 -w0 "${entry##*:}")"
      done
      cat scripts/internal/data-gates-remote.sh
    } | ssh "${HOST_SSH_OPTS[@]}" "${SSH_ALIAS}" 'sudo -k -S -p "" bash'
  )" || rc=$?
  printf -- '--- DATA GATES (host %s, %s, exit %d) ---\n' "${SSH_ALIAS}" "${HOST_SUBJECT}" "${rc}"
  while IFS= read -r line; do
    if [[ "${line}" =~ ${HOST_GATE_RE} ]]; then
      printf '%s\n' "${line}"
      results+=("${line}")
      [[ "${line}" == *" FAIL: "* ]] && fail=$((fail + 1))
    elif [[ "${line}" =~ ${HOST_RC_RE} ]]; then
      seen_rc["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
    fi
  done <<< "${reply}"
  # A check that reported no exit status did not run to an answer, however clean
  # the rest of the reply looks.
  for entry in "${DATA_CHECKS[@]}"; do
    label="${entry%%:*}"
    fallback="${entry#*:}"; fallback="${fallback%%:*}"
    if [[ -z "${seen_rc[${label}]:-}" ]]; then
      results+=("GATE: ${fallback} FAIL: the ${TARGET} host reported no result for this check")
      fail=$((fail + 1))
    elif [[ "${seen_rc[${label}]}" != "0" ]]; then
      # A check that printed only PASS lines and still exited non-zero stopped
      # part way, so its silence about the rest is not a pass.
      results+=("GATE: ${fallback} FAIL: the check exited ${seen_rc[${label}]} on the host")
      fail=$((fail + 1))
    fi
  done
}

if [[ -n "${TARGET}" ]]; then
  if [[ -n "${HOST_SUBJECT}" ]]; then
    run_host_data_gates
  else
    for entry in "${DATA_CHECKS[@]}"; do
      fallback="${entry#*:}"; fallback="${fallback%%:*}"
      results+=("GATE: ${fallback} FAIL: no snapshot to check, so this gate read nothing")
      fail=$((fail + 1))
    done
  fi
else
  # 2. G1-G6: legacy import gates
  run_step "G1-G6" bash scripts/validate-legacy-import-gates.sh

  # 3. G7: club candidates
  run_step "G7" bash scripts/validate-club-candidates.sh

  # 4. G8: bootstrap leaders
  run_step "G8" bash scripts/validate-bootstrap-leaders.sh

  # 5. G11: name variants
  run_step "G11" bash scripts/validate-name-variants.sh
fi

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
  # The smoke suite is told the environment on its command line, so a run against
  # a target certifies that target and never staging under its heading. Its AWS
  # calls are reads and its only send goes to Amazon's mailbox simulator, so
  # pointing it at the named environment is safe. A run with no target is the
  # local rehearsal, and names staging, the environment it has always smoked.
  if [[ -n "${TARGET}" ]]; then
    run_step "SMOKE" env -u SMOKE_TARGET_ENV npm run test:smoke -- --target "${TARGET}"
  else
    run_step "SMOKE" env -u SMOKE_TARGET_ENV npm run test:smoke -- --target staging
  fi
  # The browser suite is the opposite case and must not follow the target. It
  # drives onboarding, password reset and admin write flows against whatever it is
  # pointed at, and the accounts it creates would trip the guard that refuses a
  # rebuild above three sign-in-capable accounts, which would block the cutover
  # rebuild itself. Given no base URL it boots a local stack, so an unsteered run
  # under a named target proves something about this workstation and nothing about
  # the environment: it is reported as skipped rather than counted.
  if [[ -n "${TARGET}" ]]; then
    results+=("GATE: E2E SKIP: the browser suite drives write flows and creates sign-in-capable accounts, so it is never pointed at ${TARGET}; run it against a local stack")
  else
    run_step "E2E"   npm run test:e2e
  fi
else
  results+=("GATE: CLAIM-SAFETY SKIP: --skip-tests passed")
  results+=("GATE: SMOKE SKIP: --skip-tests passed")
  results+=("GATE: E2E SKIP: --skip-tests passed")
fi

# 7. Dev-admin-shortcut audit (must be clean before production), and 7a, the
#    permanent showcase event and Footbag Hacky persona. With a target both ran
#    on the host with the other data gates above.
if [[ -z "${TARGET}" ]]; then
  run_step "DEV-ADMIN-AUDIT" bash scripts/audit-dev-shortcuts.sh
  run_step "SHOWCASE-PRESENCE" bash scripts/validate-showcase-presence.sh
fi

# NOTE: the data-review sign-off is not asserted here. It is a human
# coordination contract between the maintainers, confirmed and tracked with the
# rest of the pipeline work, not a state this script can read. Checklist state
# is not kept in the database.

# 8. Live-payments boot readiness (env file names the live adapter and the
#    webhook secret; the Stripe key itself lives in SSM).
#
#    The gate reads a deploy env file, which exists on a host and nowhere else, so
#    on a workstation it used to fail for a reason that had nothing to do with the
#    environment being certified. Pointing it at a local stand-in is worse than
#    failing: it certifies a fixture under the target's heading. With a target
#    named, fetch the host's own file over the same wire every other privileged
#    step here uses; with no target and no file, say so and look at nothing.
if [[ -n "${TARGET}" ]]; then
  PAYMENTS_ENV_DIR="$(mktemp -d)"
  chmod 700 "${PAYMENTS_ENV_DIR}"
  PAYMENTS_ENV_FILE="${PAYMENTS_ENV_DIR}/env"
  if host_env_fetch "${SSH_ALIAS}" "${PAYMENTS_ENV_FILE}"; then
    run_step "PAYMENTS-BOOT" \
      env FOOTBAG_ENV_FILE="${PAYMENTS_ENV_FILE}" bash scripts/validate-payments-boot.sh
  else
    results+=("GATE: PAYMENTS-BOOT FAIL: the ${TARGET} host env file could not be read, so this gate looked at nothing")
    fail=$((fail + 1))
  fi
elif [[ -n "${FOOTBAG_ENV_FILE:-}" ]]; then
  run_step "PAYMENTS-BOOT" bash scripts/validate-payments-boot.sh
else
  results+=("GATE: PAYMENTS-BOOT SKIP: no --target and no FOOTBAG_ENV_FILE, so there is no deploy env file to read (the default /srv/footbag/env exists only on a host)")
fi

# 8a. Live outbox send-path smoke (gate G10): enqueue through the application
#     path on the production host, worker drains to live SES, inbox confirms.
#     Opt-in, because it sends real email and opens a privileged remote
#     session: it runs only when the operator supplies the email env set below;
#     otherwise it reports SKIP so a dry run stays hermetic. The inbox is
#     optional (the smoke defaults to the SES success simulator). The sudo
#     password is the production host's, chosen by the account the production
#     alias connects as through the shared credential rule, never by a variable
#     naming a file: a path supplied by hand is how one person's run ends up
#     under another's credential with nothing to say so.
if [[ "${MOCK_AWS}" -eq 0 && -n "${FOOTBAG_PRECUTOVER_EMAIL_PROFILE:-}" ]]; then
  # shellcheck source=scripts/lib/operator-credential.sh
  source scripts/lib/operator-credential.sh
  # The send script asks for a typed APPLY, but run_step captures its output, so
  # it would find no terminal. The confirmation is taken here instead, on this
  # run's terminal, and handed on as --yes only once it has been typed.
  # shellcheck source=scripts/lib/host-env-remote.sh
  source scripts/lib/host-env-remote.sh
  if require_operator_credential footbag-production production; then
    echo "G10-OUTBOX sends REAL email through production SES and the outbox on"
    echo "footbag-production, to ${FOOTBAG_PRECUTOVER_EMAIL_INBOX:-the SES success simulator}."
    if confirm_from_tty "Type APPLY to send: " "APPLY"; then
      run_step "G10-OUTBOX" bash -c \
        'bash scripts/verify-prod-email.sh --profile "$1" --outbox --yes ${2:+--inbox "$2"} < "$3"' _ \
        "${FOOTBAG_PRECUTOVER_EMAIL_PROFILE}" \
        "${FOOTBAG_PRECUTOVER_EMAIL_INBOX:-}" \
        "${OPERATOR_CREDENTIAL_FILE}"
    else
      results+=("GATE: G10-OUTBOX FAIL: not confirmed, so no mail was sent")
      fail=$((fail + 1))
    fi
  else
    results+=("GATE: G10-OUTBOX FAIL: no usable production operator credential, so the live outbox smoke did not run (the reason is printed above)")
    fail=$((fail + 1))
  fi
else
  results+=("GATE: G10-OUTBOX SKIP: set FOOTBAG_PRECUTOVER_EMAIL_PROFILE (optionally FOOTBAG_PRECUTOVER_EMAIL_INBOX) to run the live outbox smoke")
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

# NOTE: the apex MX and TXT lifetimes are not checked here and need no separate
# shrink step. The Terraform mirror publishes them at an hour and ten minutes
# from the moment delegation lands, so the zone move performs the shrink itself.

# 11. Certificate transparency for the domain. The apex authorisation record
#     limits which authority may issue; it does not limit who may prove control
#     to that authority, and the five addresses that authority accepts as proof
#     reach the outgoing operator's host until the apex mail records move. So for
#     that window the zone cannot tell you whether a certificate exists, and the
#     public logs are the only place one shows up. Reads and never writes.
if [[ "${MOCK_AWS}" -eq 1 ]]; then
  run_step "CERT-TRANSPARENCY" bash scripts/check-certificate-transparency.sh \
    --mock --domain "${DOMAIN_NAME:-footbag.org}"
else
  run_step "CERT-TRANSPARENCY" bash scripts/check-certificate-transparency.sh \
    --domain "${DOMAIN_NAME:-footbag.org}"
fi

echo
echo "=== pre-cutover summary ==="
# Name the subject before listing the verdicts. Every data gate below reads one
# database, and which one it was is the difference between a readiness result
# and a rehearsal. Stating it here means a report pasted into a cutover log
# carries its own scope, rather than depending on the reader knowing which flags
# the run was given.
if [[ -n "${TARGET}" && "${HOST_SUBJECT}" == "live" ]]; then
  echo "subject: ${TARGET}'s live database, read-only, checked on the host; nothing pulled back"
elif [[ -n "${TARGET}" ]]; then
  echo "subject: ${TARGET}, via the snapshot taken and checked on the host; nothing pulled back"
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
